import assert from "node:assert/strict";
import test from "node:test";
import { maySupervisorManageStoreUser } from "../supabase/functions/manage-wms-user/permissions.ts";

test("supervisor can create an attendant in an allowed warehouse", () => {
  assert.equal(maySupervisorManageStoreUser({
    callerRole: "SUPERVISOR",
    allowedWarehouses: ["VDCG"],
    nextRole: "ATENDENTE",
    nextWarehouse: "VDCG"
  }), true);
});

test("supervisor cannot create an attendant in another warehouse", () => {
  assert.equal(maySupervisorManageStoreUser({
    callerRole: "SUPERVISOR",
    allowedWarehouses: ["VDCG"],
    nextRole: "ATENDENTE",
    nextWarehouse: "VDCO"
  }), false);
});

test("supervisor cannot promote store users to privileged roles", () => {
  assert.equal(maySupervisorManageStoreUser({
    callerRole: "SUPERVISOR",
    allowedWarehouses: ["VDCG"],
    currentRole: "ATENDENTE",
    currentWarehouse: "VDCG",
    nextRole: "SUPERVISOR",
    nextWarehouse: "VDCG"
  }), false);
});
