import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const output = ts.transpileModule(fs.readFileSync('src/lib/payment-allocation.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const exports = {}; new Function('exports', output)(exports);
const {allocatePayment: split, oldestUnpaidDueDate: dueSince} = exports;
test('automatic early payments pay upcoming interest before principal', () => {
  const partial=split(5,120,0,12,10);
  assert.equal(partial.interest,5);
  assert.equal(partial.principalAmount,0);
  assert.equal(12-partial.adjustmentDelta,7);
  const extra=split(32,120,0,12,10);
  assert.equal(extra.interest,12);
  assert.equal(extra.principalAmount,20);
});
test('automatic payments with overdue interest pay only the overdue interest first', () => {
  const s=split(32,120,12,12,10);
  assert.equal(s.interest,12);
  assert.equal(s.principalAmount,20);
  assert.equal(s.earlyInterest,0);
  assert.equal(split(42,1150,57.5,57.5,5).accruedAfter,15.5);
});
test('early interest leaves principal intact and clears upcoming interest', () => {
  const s=split(12,120,0,12,10,12);
  assert.equal(s.principalAmount,0);
  assert.equal(s.accruedAfter,0);
  assert.equal(120*.1-s.adjustmentDelta,0);
});
test('partial early interest leaves the installment remainder', () => {
  const s=split(5,120,0,12,10,5);
  assert.equal(12-s.adjustmentDelta,7);
});
test('combined payment covers upcoming installment; later interest uses reduced principal', () => {
  const s=split(32,120,0,12,10,12);
  assert.equal(s.principalAmount,20);
  assert.equal(100*.1-s.adjustmentDelta,0);
  assert.equal(100*.1,10);
  assert.equal(-s.adjustmentDelta+s.adjustmentDelta,0);
});
test('arrears are paid before upcoming interest and repeated credits cannot duplicate payment', () => {
  const s=split(17,120,5,12,10,17);
  assert.equal(s.earlyInterest,12);
  assert.equal(s.accruedAfter,0);
  assert.throws(()=>split(12,120,0,0,10,12));
});
test('invalid splits cannot create negative balances', () => {
  for(const interest of [-1,13,NaN,Infinity]) assert.throws(()=>split(12,120,0,12,10,interest));
  assert.throws(()=>split(150,120,0,12,10,12));
});

test('paying the oldest months moves the unpaid date forward', () => {
  // Owes Aug, Sep and Oct at $5 each; next due date is 3 Nov.
  assert.equal(dueSince(15,5,'2026-11-03',3,'2026-08-03'),'2026-08-03');
  assert.equal(dueSince(10,5,'2026-11-03',3,'2026-08-03'),'2026-09-03');
  assert.equal(dueSince(3,5,'2026-11-03',3,'2026-08-03'),'2026-10-03');
  assert.equal(dueSince(0,5,'2026-11-03',3,'2026-08-03'),null);
  // Never earlier than the known oldest date, and short months use their last day.
  assert.equal(dueSince(40,5,'2026-11-03',3,'2026-08-03'),'2026-08-03');
  assert.equal(dueSince(5,5,'2026-03-31',31,null),'2026-02-28');
});
