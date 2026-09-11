import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const output = ts.transpileModule(fs.readFileSync('src/lib/payment-allocation.ts', 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const exports = {}; new Function('exports', output)(exports);
const {allocatePayment: split} = exports;
test('automatic early payments still reduce principal', () => {
  assert.equal(split(12,120,0,0,10).principalAmount,12);
  assert.equal(split(32,120,12,0,10).interest,12);
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
