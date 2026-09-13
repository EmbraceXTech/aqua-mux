# Agent instructions

## React and Next.js rules

- Keep component and hook renders pure and idempotent. Do not mutate props, state, context, hook arguments, globals, or values already passed to JSX. Do not read time, random values, browser storage, or wallet state during render.
- Call hooks unconditionally at the top level of React components or custom hooks. Do not call components as ordinary functions.
- Compute render data from props and state during render. Use `useMemo` only for an expensive calculation with a measured or clear cost. Do not mirror derived values in state.
- Use event handlers for user-caused work, including transaction preparation, signature requests, and broadcasts. Use effects only to synchronize with an external system. Every effect that subscribes, polls, starts a timer, or fetches must clean up, handle cancellation or stale results, and list complete dependencies.
- Keep wallet access, browser APIs, effects, state, and event handlers behind the smallest practical `'use client'` boundary. Prefer Server Components for static UI and server-only reads. Never import server-only code, secrets, database clients, or private-key code into a Client Component.
- Treat every API route, Server Action, and data-access function as a separate entry point. Validate untrusted input with a schema, authenticate the caller, and authorize the requested owner and resource at the data boundary. Client-side hiding is not authorization.
- Return minimal DTOs to Client Components. Do not pass sessions, raw credentials, private data, or internal errors to the browser.
- Only variables deliberately safe for browser disclosure may use the `NEXT_PUBLIC_` prefix. Never expose `PRIVATE_KEY`, RPC credentials, API keys, bearer tokens, session secrets, or raw model input or output in browser code, logs, tests, or committed files.

## EVM, wallet, and signing rules

- Treat wallet providers, RPC responses, route responses, token metadata, query parameters, local storage, and browser state as untrusted input. Validate data at each boundary and use `bigint` for on-chain integer amounts. Do not use JavaScript `number` for token units, wei, nonces, chain IDs, or balances.
- Keep a reviewed chain registry. Before preparing, signing, or broadcasting, verify the selected chain ID, account, contract address, ABI, calldata, token decimals, recipient, value, deadline, nonce, and fee limits against that registry and the current wallet state. Fail closed on a mismatch or unknown value.
- Subscribe to and correctly clean up `accountsChanged`, `chainChanged`, `connect`, and `disconnect`. Invalidate account-scoped and chain-scoped UI data when these events occur. Re-check account and chain immediately before every signature or broadcast.
- Do not treat a connected account, a wallet capability report, or an RPC result as permission for managed execution. Preserve the named-adapter, owner-authentication, browser-lease, and explicit-confirmation gates documented in the application.
- Separate read, simulation, approval, signature, broadcast, receipt, and confirmation states. A submitted transaction is not confirmed. Reconcile receipts and report unknown or incomplete observation coverage as unknown.
- Build transactions from reviewed, immutable inputs. Show the user the exact chain, contract, method, recipient or spender, token amounts in base units and display units, approval scope, deadline, and maximum fees before requesting a signature. Require explicit confirmation for every fund-moving action.
- Default approvals to the smallest required amount and shortest supported lifetime. Do not add unlimited approvals, blind signing, `eth_sign`, arbitrary `personal_sign`, or an approval-plus-action batch without explicit product requirements, clear signing, and tests.
- Use EIP-712 typed data when the protocol supports it. Bind the domain to the expected chain ID and verifying contract, include replay controls such as a nonce and expiry where the protocol supports them, and verify recovered signers server-side before accepting a signature for authentication.
- Never persist, transmit, log, or send a seed phrase, private key, wallet credential, or signing payload to a model or third party. Server-side signing remains loopback development only and requires the existing explicit opt-in and fee cap.
- Pin contract addresses and ABIs by supported chain. Do not accept a contract address, spender, RPC URL, or calldata from the browser as trusted configuration. Do not add a chain or claim compatibility without recorded tests and evidence.

## Sources

These rules are based on the React Rules and Effect guidance, Next.js server and authorization guidance, EIP-1193, EIP-712, and OWASP Web3 security guidance.

- [https://react.dev/reference/rules](https://react.dev/reference/rules)
- [https://react.dev/learn/you-might-not-need-an-effect](https://react.dev/learn/you-might-not-need-an-effect)
- [https://nextjs.org/docs/app/guides/authentication](https://nextjs.org/docs/app/guides/authentication)
- [https://nextjs.org/docs/app/getting-started/server-and-client-components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [https://eips.ethereum.org/EIPS/eip-1193](https://eips.ethereum.org/EIPS/eip-1193)
- [https://eips.ethereum.org/EIPS/eip-712](https://eips.ethereum.org/EIPS/eip-712)
- [https://scs.owasp.org/handbooks/09-ux-security/part3-best-practices/](https://scs.owasp.org/handbooks/09-ux-security/part3-best-practices/)
- [https://scs.owasp.org/handbooks/08-sdk-security-testing/part2-testing-methodology/](https://scs.owasp.org/handbooks/08-sdk-security-testing/part2-testing-methodology/)

