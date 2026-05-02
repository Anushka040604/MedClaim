from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re

from app.ai_pipeline.groq_client import chat_completion
from app.core.config import settings


@dataclass
class PolicyComplianceResult:
    compliant: bool | None
    clause_citations: list[dict]
    explanation: str


def _load_policy_chunks() -> list[dict]:
    base = Path(settings.policies_dir)
    if not base.is_absolute():
        # Resolve relative to backend directory (parent of app/) so it works regardless of cwd
        backend_root = Path(__file__).resolve().parent.parent.parent.parent
        base = (backend_root / settings.policies_dir).resolve()
    if not base.exists():
        return []

    chunks: list[dict] = []
    for p in base.glob("**/*"):
        if not p.is_file():
            continue
        if p.suffix.lower() not in {".txt"}:
            continue
        text = p.read_text(encoding="utf-8", errors="ignore")
        for i, part in enumerate(_chunk_text(text)):
            chunks.append({"id": f"{p.name}:{i}", "source": p.name, "text": part})
    return chunks


def _chunk_text(text: str, chunk_size: int = 900, overlap: int = 150) -> list[str]:
    text = " ".join(text.split())
    if not text:
        return []
    out: list[str] = []
    start = 0
    while start < len(text):
        end = min(len(text), start + chunk_size)
        out.append(text[start:end])
        if end == len(text):
            break
        start = max(0, end - overlap)
    return out


def policy_rag_check_with_llm(*, policy_query: str, top_k: int = 4) -> PolicyComplianceResult:
    """
    Minimal local RAG:
    - Loads `.txt` policy files from `POLICIES_DIR`
    - Embeds chunks with sentence-transformers
    - Stores/queries in local ChromaDB
    - Uses Groq to answer with citations

    If GROQ_API_KEY is missing, returns retrieval-only output.
    """
    policy_chunks = _load_policy_chunks()
    if not policy_chunks:
        return PolicyComplianceResult(
            compliant=None,
            clause_citations=[],
            explanation="No policy documents found (add .txt files under POLICIES_DIR).",
        )

    # Retrieval: prefer local vector store if available; otherwise fallback to token overlap scoring.
    citations: list[dict] = []
    context_parts: list[str] = []

    def _fallback_retrieve() -> list[dict]:
        tokens = set(re.findall(r"[a-z0-9]+", policy_query.lower()))
        scored: list[tuple[int, dict]] = []
        for c in policy_chunks:
            c_tokens = set(re.findall(r"[a-z0-9]+", c["text"].lower()))
            score = len(tokens.intersection(c_tokens))
            scored.append((score, c))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [c for score, c in scored[: min(top_k, len(scored))] if score > 0] or policy_chunks[: min(top_k, len(policy_chunks))]

    # Default to a fast, dependency-free retrieval method.
    # Vector retrieval is optional and can trigger large model downloads on first run.
    if not bool(getattr(settings, "rag_use_vectors", False)):
        retrieved = _fallback_retrieve()
    else:
        try:
            import chromadb  # type: ignore
            from sentence_transformers import SentenceTransformer  # type: ignore

            client = chromadb.PersistentClient(path=settings.chroma_dir)
            try:
                client.delete_collection("policies")
            except Exception:
                pass
            collection = client.create_collection("policies")

            model = SentenceTransformer("all-MiniLM-L6-v2")
            ids = [c["id"] for c in policy_chunks]
            docs = [c["text"] for c in policy_chunks]
            metas = [{"source": c["source"]} for c in policy_chunks]
            embeddings = model.encode(docs, normalize_embeddings=True).tolist()
            collection.add(ids=ids, documents=docs, metadatas=metas, embeddings=embeddings)

            q_emb = model.encode([policy_query], normalize_embeddings=True).tolist()[0]
            res = collection.query(query_embeddings=[q_emb], n_results=min(top_k, len(policy_chunks)))
            retrieved = []
            for i in range(len(res.get("ids", [[]])[0])):
                retrieved.append(
                    {
                        "id": res["ids"][0][i],
                        "source": res["metadatas"][0][i].get("source"),
                        "text": res["documents"][0][i],
                    }
                )
        except Exception:
            retrieved = _fallback_retrieve()

    for item in retrieved:
        citations.append({"id": item["id"], "source": item["source"], "text": item["text"]})
        context_parts.append(f"[{item['id']} | {item['source']}]\n{item['text']}")

    clauses_text = "\n\n".join(context_parts)[:8000]
    prompt = f"""
You are an insurance policy compliance assistant.
Given the user claim query and the policy clauses, decide if the claim is covered.

Return ONLY JSON with:
- compliant: true/false
- explanation: short plain-English
- citations: array of clause ids you used

Claim query:
{policy_query}

Policy clauses:
{clauses_text}
""".strip()

    import json

    if not settings.groq_api_key:
        return PolicyComplianceResult(
            compliant=None,
            clause_citations=citations,
            explanation="Set GROQ_API_KEY (retrieval-only mode without LLM reasoning).",
        )

    try:
        raw = chat_completion(
            api_key=settings.groq_api_key,
            model=settings.groq_model_reasoning,
            messages=[
                {"role": "system", "content": "Return ONLY valid JSON. No markdown."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=900,
        )
    except Exception as e:  # noqa: BLE001
        return PolicyComplianceResult(
            compliant=None,
            clause_citations=citations,
            explanation=f"Groq error: {type(e).__name__}: {str(e)[:200]}",
        )

    # Strip markdown code block if present (e.g. ```json ... ```)
    if "```" in raw:
        for marker in ("```json", "```"):
            if marker in raw:
                raw = raw.split(marker, 1)[-1].rsplit("```", 1)[0].strip()
                break
    try:
        parsed = json.loads(raw)
        return PolicyComplianceResult(
            compliant=bool(parsed.get("compliant")),
            clause_citations=[c for c in citations if c["id"] in set(parsed.get("citations") or [])],
            explanation=str(parsed.get("explanation") or ""),
        )
    except Exception:
        return PolicyComplianceResult(
            compliant=None,
            clause_citations=citations,
            explanation=f"LLM output parse error. Raw: {raw[:500]}",
        )

