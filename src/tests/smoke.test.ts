import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createApp } from "../create-app.js";

// These checks exercise local fallback behavior without a database or paid APIs.
const app = await createApp();
after(async () => app.close());

test("health reports the local mode", async () => {
  const response = await app.inject({ method: "GET", url: "/health" });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    service: "rpg-agent-backend",
    mode: "mock-without-database"
  });
});

test("commission intent respects a studying user", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/action/commission/interpret",
    payload: { text: "我现在在学习" }
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().shouldGenerateCommission, false);
  assert.equal(response.json().scenario, "STUDYING");
});

test("invalid coordinates are rejected", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/action/quest-board",
    payload: { latitude: "not-a-number", longitude: 116.4 }
  });
  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error, "BAD_REQUEST");
});

test("quest board offers sample quests in fallback mode", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/action/quest-board",
    payload: { latitude: 39.9, longitude: 116.4, count: 2 }
  });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.status, "READY");
  assert.equal(body.quests.length, 2);
});
