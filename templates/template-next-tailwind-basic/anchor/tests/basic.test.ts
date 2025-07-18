import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  appendTransactionMessageInstruction,
  createSolanaClient,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
} from 'gill'
import { loadKeypairSignerFromFile } from 'gill/node'
import { getGreetInstruction } from '@project/anchor'

describe('basic', () => {
  const anchorToml = fs.readFileSync(path.resolve(__dirname, '..', 'Anchor.toml'), 'utf8')
  const walletMatch = anchorToml.match(/wallet\s*=\s*"([^"]+)"/)
  const walletPath = walletMatch ? walletMatch[1].replace(/^~(?=\/)/, os.homedir()) : ''

  const client = createSolanaClient({ urlOrMoniker: 'localnet' })
  let signer: Awaited<ReturnType<typeof loadKeypairSignerFromFile>>

  beforeAll(async () => {
    signer = await loadKeypairSignerFromFile(walletPath)
  })

  it('should run the program and print "GM!" to the transaction log', async () => {
    const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send()
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(signer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m) => appendTransactionMessageInstruction(getGreetInstruction(), m),
    )

    const signature = await signAndSendTransactionMessageWithSigners(message)
    const tx = await client.rpc.getTransaction(signature).send()
    expect(tx.meta?.logMessages?.some((l) => l.includes('GM!'))).toBe(true)
  })
})
