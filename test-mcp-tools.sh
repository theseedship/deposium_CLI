#!/bin/bash
# Test MCP Server Tools via CLI

API_KEY="06759d856cc451bef54f9392365902271890309774303d7a47fc375cdc40cced"
MCP_URL="http://localhost:4001/mcp"

echo "==========================================="
echo "  Testing Deposium MCP Tools via CLI"
echo "==========================================="
echo ""

# Test 1: System Health
echo "=== Test 1: System Health ===="
curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Api-Key: $API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"system_health","arguments":{"verbose":false}},"id":1}' \
  | python3 -m json.tool | grep -A 5 "overall"
echo ""

# Test 2: Smart Analyze
echo "=== Test 2: Smart Analyze (Query Intent) ===="
curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Api-Key: $API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"smart_analyze","arguments":{"query_text":"How do I optimize HNSW index performance?"}},"id":1}' \
  | python3 -m json.tool | grep -A 10 "structuredContent"
echo ""

# Test 3: Smart Suggest
echo "=== Test 3: Smart Suggest (Auto-complete) ===="
curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Api-Key: $API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"smart_suggest","arguments":{"partial_query":"machine learn","tenant_id":"test","space_id":"default"}},"id":1}' \
  | python3 -m json.tool | grep -A 8 "related_queries"
echo ""

# Test 4: Search Hub
echo "=== Test 4: Search Hub (Unified Search) ===="
curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Api-Key: $API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_hub","arguments":{"tenant_id":"test","space_id":"default","query_text":"AI optimization techniques","top_k":5,"use_vector_rel":true}},"id":1}' \
  | python3 -m json.tool | grep -A 5 "execution_time_ms"
echo ""

# Test 5: LeanRAG Analyze
echo "=== Test 5: LeanRAG Analysis ===="
curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Api-Key: $API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"leanrag_analyze","arguments":{"tenant_id":"test","space_id":"default","include_metrics":true}},"id":1}' \
  | python3 -m json.tool | grep -A 6 "total_entities"
echo ""

# Test 6: Smart Elicit
echo "=== Test 6: Smart Elicit (Query Clarification) ===="
curl -s -X POST $MCP_URL \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Api-Key: $API_KEY" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"smart_elicit","arguments":{"query_text":"docs","search_results":0}},"id":1}' \
  | python3 -m json.tool | grep -A 5 "needs_clarification"
echo ""

echo "==========================================="
echo "  MCP Tools Test Complete!"
echo "==========================================="
