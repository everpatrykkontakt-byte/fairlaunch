import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptsBacking, canTransition, isTerminal } from "./stateMachine.ts";

test("legal transitions are allowed", () => {
  assert.ok(canTransition("backing", "funded"));
  assert.ok(canTransition("funded", "launching"));
  assert.ok(canTransition("launching", "live"));
  assert.ok(canTransition("backing", "refunding"));
});

test("illegal transitions are rejected", () => {
  assert.ok(!canTransition("live", "launching"), "cannot relaunch a live token");
  assert.ok(!canTransition("failed", "backing"), "cannot revive a failed campaign");
  assert.ok(!canTransition("backing", "live"), "cannot skip launch");
});

test("terminal + backing predicates", () => {
  assert.ok(isTerminal("live"));
  assert.ok(isTerminal("failed"));
  assert.ok(!isTerminal("backing"));
  assert.ok(acceptsBacking("backing"));
  assert.ok(!acceptsBacking("funded"));
});
