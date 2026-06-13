// Runnable tests for the voice command matcher (no test framework needed):
//   cd frontend && node src/lib/commands.test.mjs
//
// Verifies entity extraction and action routing, and that plain transaction
// phrases fall through (return null) to the LLM/heuristic parser.

import assert from 'node:assert'
import { matchCommand } from './commands.js'

let pass = 0
let fail = 0

function eq(label, actual, expected) {
  try {
    assert.deepStrictEqual(actual, expected)
    console.log(`  PASS  ${label}`)
    pass++
  } catch {
    console.log(`  FAIL  ${label}\n        got:      ${JSON.stringify(actual)}\n        expected: ${JSON.stringify(expected)}`)
    fail++
  }
}

// --- Create a new (duplicate) khata --------------------------------------- #
eq('open new khata for Rahul (EN)',
  matchCommand('Open a new khata for Rahul'),
  { type: 'createKhata', name: 'Rahul' })

eq('create new account for Rahul (EN)',
  matchCommand('Create a new account for Rahul'),
  { type: 'createKhata', name: 'Rahul' })

eq('naya khata kholo Rahul (Hinglish)',
  matchCommand('naya khata kholo Rahul ke naam se'),
  { type: 'createKhata', name: 'Rahul' })

eq('नया खाता खोलो राहुल (Hindi)',
  matchCommand('नया खाता खोलो राहुल के नाम से'),
  { type: 'createKhata', name: 'राहुल' })

// --- Open a customer's khata ---------------------------------------------- #
eq("open Rahul's khata (EN possessive)",
  matchCommand("Open Rahul's khata"),
  { type: 'openKhata', name: 'Rahul' })

eq('राहुल का खाता खोलो (Hindi)',
  matchCommand('राहुल का खाता खोलो'),
  { type: 'openKhata', name: 'राहुल' })

// --- Open the last invoice ------------------------------------------------ #
eq('open the last invoice of Rahul',
  matchCommand('Open the last invoice of Rahul'),
  { type: 'openInvoice', name: 'Rahul', which: 'last' })

// --- Bare navigation (no entity) ------------------------------------------ #
eq('show invoices -> nav', matchCommand('show invoices'), { type: 'nav', tab: 'invoices' })
eq('open khata -> nav', matchCommand('open khata'), { type: 'nav', tab: 'ledger' })
eq('show settings -> nav', matchCommand('show settings'), { type: 'nav', tab: 'settings' })

// --- Plain transaction phrases must NOT be commands (fall through to LLM) -- #
eq('Add ₹500 to Udayveer Singh -> null', matchCommand('Add ₹500 to Udayveer Singh'), null)
eq('Suresh ko 200 udhaar -> null', matchCommand('Suresh ko 200 rupaye udhaar'), null)
eq('empty -> null', matchCommand('  '), null)

console.log(`\n${'='.repeat(40)}\n${pass}/${pass + fail} checks passed\n${'='.repeat(40)}`)
process.exit(fail === 0 ? 0 : 1)
