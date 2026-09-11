import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(path) {
  const output = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {}; new Function('exports', output)(exports); return exports;
}
const { projectCollectionLoan: project, collectionReportParts: report, cambodiaToday } = load('src/lib/telegram-collection.ts');
const { deliverReportParts } = load('src/lib/telegram-report-delivery.ts');
const row = { id:'1', loan_number:1, borrower:'A & <B>', current_principal:400, accrued_interest:0, monthly_interest_rate:7, next_interest_adjustment:0, payment_day:10, next_date:'2026-09-10', interest_date:null };
test('Cambodia midnight and three-day boundary', () => {
  assert.equal(cambodiaToday(new Date('2026-09-08T17:00:00Z')), '2026-09-09');
  assert.equal(project(row, '2026-09-07').days, 3);
});
test('upcoming, due and overdue interest stay current without mutating records', () => {
  assert.equal(project(row, '2026-09-09').interest, 28);
  assert.equal(project(row, '2026-09-10').days, 0);
  assert.equal(project(row, '2026-10-11').interest, 56);
  assert.equal(project(row, '2026-10-11').dueDate, '2026-09-10');
  assert.equal(row.accrued_interest, 0);
});
test('partial unpaid interest, top-up adjustment and zero rate', () => {
  assert.equal(project({...row, accrued_interest:10, interest_date:'2026-08-10',next_interest_adjustment:2.5}, '2026-09-10').interest, 40.5);
  assert.equal(project({...row,next_interest_adjustment:2.5}, '2026-09-09').interest, 30.5);
  assert.equal(project({...row,monthly_interest_rate:0}, '2026-09-09').interest, 0);
});
test('month-end accrual restores preferred day after leap February', () => {
  const loan={...row,payment_day:31,next_date:'2028-01-31'};
  assert.equal(project(loan, '2028-03-30').interest, 56);
  assert.equal(project(loan, '2028-03-31').interest, 84);
});
test('exclusive groups, exact interest totals, escaped names, outside horizon excluded', () => {
  const today='2026-09-09';
  const loans=[0,1,3,4,-1].map((offset,i)=>project({...row,id:String(i),loan_number:i+1,next_date:`2026-09-${String(9+offset).padStart(2,'0')}`},today));
  const text=report(loans,today).join('\n');
  assert.match(text,/Due today \(1\)/);assert.match(text,/Due within 3 days \(2\)/);assert.match(text,/Overdue \(1\)/);
  assert.match(text,/Due within 3 days: <b>\$56.00/);assert.match(text,/1 day\(s\) overdue/);
  assert.equal((text.match(/KJ-0001/g)||[]).length,1);assert.doesNotMatch(text,/KJ-0004/);assert.match(text,/A &amp; &lt;B&gt;/);
});
test('long reports split into valid complete entries under Telegram limit', () => {
  const parts=report(Array.from({length:100},(_,i)=>project({...row,id:String(i),loan_number:i+1},'2026-09-09')),'2026-09-09');
  assert.ok(parts.length>1);
  for(const part of parts){assert.ok(part.length<=4096);assert.equal((part.match(/<b>/g)||[]).length,(part.match(/<\/b>/g)||[]).length)}
  assert.equal((parts.join('').match(/KJ-/g)||[]).length,100);
  assert.match(report([], '2026-09-09')[0],/Due today \(0\)/);
});
test('failed later part resumes without repeating acknowledged parts',async()=>{
  let progress=0;const sent=[];let failed=false;
  const send=async text=>{if(text==='b'&&!failed){failed=true;throw Error('temporary outage')}sent.push(text)};
  const save=async count=>{progress=count};
  await assert.rejects(deliverReportParts(['a','b','c'],progress,send,save));assert.equal(progress,1);
  await deliverReportParts(['a','b','c'],progress,send,save);assert.deepEqual(sent,['a','b','c']);
  await deliverReportParts(['a','b','c'],progress,send,save);assert.deepEqual(sent,['a','b','c']);
});
test('prepaid installment does not become overdue or consume existing arrears', () => {
  const prepaid={...row,current_principal:120,monthly_interest_rate:10,next_date:'2026-09-15',payment_day:15,next_interest_adjustment:-12};
  const paid=project(prepaid,'2026-09-15');
  assert.equal(paid.dueDate,'2026-10-15');
  assert.equal(paid.interest,12);
  const arrears=project({...prepaid,current_principal:100,accrued_interest:5,interest_date:'2026-08-15'},'2026-09-15');
  assert.equal(arrears.interest,5);
});
