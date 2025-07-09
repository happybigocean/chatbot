"""
ask_responses.py
────────────────
Query your LitMag vector-store with GPT-4.1 + File Search.

    $ source .venv/bin/activate
    $ python ask_responses.py "Give me two articles that debate the term 'hypertext'."
"""

import os
import sys
import pathlib

import openai
import dotenv


# ── 1  Load .env (override any empty shell vars) ────────────────────────────
BASE_DIR = pathlib.Path(__file__).resolve().parent
dotenv.load_dotenv(BASE_DIR / ".env", override=True)
if not os.getenv("OPENAI_API_KEY"):
    # fallback if the script is run from elsewhere
    dotenv.load_dotenv(dotenv.find_dotenv(), override=True)

VECTOR_STORE_ID = os.getenv("VECTOR_STORE_ID")
if not VECTOR_STORE_ID:
    raise SystemExit("VECTOR_STORE_ID missing – run bootstrap_responses.py first.")

# ── 2  Grab the user’s question ─────────────────────────────────────────────
question = " ".join(sys.argv[1:]) or input("❓  ")

# ── 3  Query GPT-4.1 (non-streaming) ────────────────────────────────────────
client = openai.OpenAI()

resp = client.responses.create(
    model="gpt-4.1",
    input=question,
    tools=[{
        "type": "file_search",
        "vector_store_ids": [VECTOR_STORE_ID],
        "max_num_results": 40,               # adjust recall here
    }]
)

# ── 4  Extract the assistant’s message text ────────────────────────────────
answer_text = None
for item in resp.output:
    if getattr(item, "role", "") == "assistant":
        # first ResponseOutputText chunk is the answer
        answer_text = item.content[0].text
        break

if answer_text:
    print(answer_text)
else:
    print("⚠️  No assistant answer found; full response below for inspection:\n")
    print(resp)
