from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import asyncio, json
from typing import Dict, Any, Set

router = APIRouter(prefix="/api/v1/events", tags=["events"])

_subscribers: Set[asyncio.Queue] = set()

async def _event_stream():
    queue: asyncio.Queue = asyncio.Queue()
    _subscribers.add(queue)
    try:
        while True:
            data = await queue.get()
            yield f"data: {json.dumps(data)}\n\n"
    finally:
        _subscribers.discard(queue)

@router.get("/sse")
async def sse():
    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(_event_stream(), media_type="text/event-stream", headers=headers)

def publish_event(event: Dict[str, Any]):
    for q in list(_subscribers):
        try:
            q.put_nowait(event)
        except Exception:
            pass
