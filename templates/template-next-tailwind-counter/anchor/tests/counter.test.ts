import fs from 'fs'
import os from 'os'
import path from 'path'

function getWalletPath() {
  const fromEnv = process.env.ANCHOR_WALLET
  if (fromEnv) return fromEnv.replace(/^~(?=\/)/, os.homedir())
  const anchorToml = fs.readFileSync(
    path.resolve(__dirname, '..', 'Anchor.toml'),
    'utf8',
  )
  const match = anchorToml.match(/wallet\s*=\s*"([^"]+)"/)
  return match ? match[1].replace(/^~(?=\/)/, os.homedir()) : ''
}
import {
  appendTransactionMessageInstruction,
  createSolanaClient,
  createTransactionMessage,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signAndSendTransactionMessageWithSigners,
} from 'gill'
import {
  generateExtractableKeyPairSigner,
  loadKeypairSignerFromFile,
} from 'gill/node'
import {
  fetchMaybeCounter,
  fetchCounter,
  getCloseInstruction,
  getDecrementInstruction,
  getIncrementInstruction,
  getInitializeInstruction,
  getSetInstruction,
} from '@project/anchor'

describe('counter', () => {
  const walletPath = getWalletPath()

  const client = createSolanaClient({ urlOrMoniker: 'localnet' })
  let payer: Awaited<ReturnType<typeof loadKeypairSignerFromFile>>
  let counterSigner: Awaited<ReturnType<typeof generateExtractableKeyPairSigner>>

  beforeAll(async () => {
    payer = await loadKeypairSignerFromFile(walletPath)
    counterSigner = await generateExtractableKeyPairSigner()
  })

  async function send(ix: Parameters<typeof appendTransactionMessageInstruction>[0]) {
    const { value: latestBlockhash } = await client.rpc.getLatestBlockhash().send()
    const message = pipe(
      createTransactionMessage({ version: 0 }),
      (m) => setTransactionMessageFeePayerSigner(payer, m),
      (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
      (m) => appendTransactionMessageInstruction(ix, m),
    )
    await signAndSendTransactionMessageWithSigners(message)
  }

  it('Initialize Counter', async () => {
    await send(
      getInitializeInstruction({ payer, counter: counterSigner })
    )
    const account = await fetchCounter(client.rpc, counterSigner.address)
    expect(account.data.count).toBe(0)
  })

  it('Increment Counter', async () => {
    await send(getIncrementInstruction({ counter: counterSigner.address }))
    const account = await fetchCounter(client.rpc, counterSigner.address)
    expect(account.data.count).toBe(1)
  })

  it('Increment Counter Again', async () => {
    await send(getIncrementInstruction({ counter: counterSigner.address }))
    const account = await fetchCounter(client.rpc, counterSigner.address)
    expect(account.data.count).toBe(2)
  })

  it('Decrement Counter', async () => {
    await send(getDecrementInstruction({ counter: counterSigner.address }))
    const account = await fetchCounter(client.rpc, counterSigner.address)
    expect(account.data.count).toBe(1)
  })

  it('Set counter value', async () => {
    await send(getSetInstruction({ counter: counterSigner.address, value: 42 }))
    const account = await fetchCounter(client.rpc, counterSigner.address)
    expect(account.data.count).toBe(42)
  })

  it('Close the counter account', async () => {
    await send(getCloseInstruction({ payer, counter: counterSigner.address }))
    const account = await fetchMaybeCounter(client.rpc, counterSigner.address)
    expect(account).toBeNull()
  })
})
