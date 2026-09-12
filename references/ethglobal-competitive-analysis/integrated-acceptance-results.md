# Integrated AquaMux acceptance

The actual Orca browser journey created and reviewed a two-pair managed LP proposal through the HarnessAgent runner, prepared an unsigned eight-call plan, started and stopped management, and recovered the stopped group after reload.
Public-chain activity in this run was limited to reads, quotes, and simulation.
No funding transaction was replayed and no public transaction was submitted.
Independent code-quality review of the new commits has been requested and is pending.

## Scope and ownership

This dispatch owns runner service output formatting, duplicate-group proposal refusal, failed-review messaging, token identity in plan review, and the evidence listed below.
It does not own the concurrent Ethereum route and account adapter changes.
No unit tests were added or modified by this dispatch.
All browser interaction used Orca's embedded browser through the Orca CLI.
Existing controlled fork scripts ran through Orca terminals, without browser automation.

| Commit | Change | Reproduction and validation |
| --- | --- | --- |
| a41c89603c08f8cde664576fab872c11e3b7e456 | Initial proposal output requires a preview identifier and null configuration, with concise model prose. | Actual two-pair inference exceeded quote freshness before the fix; the final successful request completed in 22.103 seconds. |
| 8c8e9fd6e95ff7c0022b3a1b2598a0813b2a945a | Refuse a duplicate active group before inference and display failed-review errors. | An existing Arbitrum draft caused a late storage failure hidden by successful model rationale; the corrected UI returned group_exists with recovery guidance. |
| 5525d32b4df4e3770729ade705dd38b5dc0f3928 | Show contract addresses beside reviewed token amounts. | Native and bridged USDC both normalize to the contract symbol USDC, making amount-only review ambiguous. |

Each source commit used the repository commit lock, a fresh private index, an exact path manifest, index backups, and unrelated-index verification.
The original dirty chart, legacy, and report changes were preserved.
No generated file, CHANGELOG, README, or unrelated dirty file was committed.

## Actual app journey

Frontend port 33127 and runner port 33128 were started with the established dev-agent commands.
The frontend used the ignored development wallet environment and the explicit 300000000000000 wei fee cap.
The runner startup path excludes PRIVATE_KEY.
The original database was preserved; the final two-pair creation used the isolated database at /tmp/aquamux-integrated-acceptance.sqlite.
The original frontend environment was restored after captures.
The ignored isolated environment remains at apps/frontend/verification/integrated-acceptance-wallet.env with mode 0600 for local reproduction.

The maker was 0x992A6a939579e10Ad47C347a5be3788c94992Dd4 on Arbitrum, chain 42161.
The form selected native ETH funding of 0.0001 with a 0.0005 ETH reserve and a 15-minute review interval.
Dynamic registry selection included native USDC at 0xaf88d065e77c8cc2239327c5edb3a432268e5831 and bridged USDC_1 at 0xff970a61a04b1ca14834a43f5de4533ebddb5cc8.
Authoritative metadata normalized the latter symbol to USDC while preserving its distinct address and decimals.
The resulting group d1048340-e530-40fa-bec8-4241e6c94bda contained both WETH pairs and exact rational pair parameters.

The actual proposal request 8653e82a-a81f-423d-876b-e19e9939d02e invoked proposal_preview through HarnessAgent and succeeded in 22103 milliseconds.
Its request snapshot, result, tool events, and usage are recorded in the observations artifact, correlated with the runner SQLite review record.
Earlier observed attempts took 31697 and 34385 milliseconds and correctly failed the existing quote freshness check.
A compact schema alone still took 31593 milliseconds; concise prose plus the compact schema produced measured samples of 21792 and 22103 milliseconds.
These are individual observations, not a latency guarantee.
The quote expiry and execution authorization checks were not relaxed.

The live unsigned plan contained eight atomic calls for two registrations.
Public Arbitrum simulation succeeded at block 504255039 at 2026-09-12T02:47:01Z.
The plan expired at 2026-09-12T02:47:29Z and the UI disabled confirmation with an explicit expired-plan message.
Estimated gas was 0.000031351985004 ETH, with the selected 0.0005 ETH reserve.
Minimum receipts were 0.06253 native USDC and 0.062498 bridged USDC.
The user confirmation checkbox was never selected and the development signer was never asked to submit this plan.
Conservative output amounts are plan estimates, not attributable realized inventory or returns.

The bot was started through Controls with the required consent.
The interval request f1c9b7be-48a6-4ac3-84da-2fcf513e75f4 completed in 27727 milliseconds and held because indexed position and backing reconciliation did not justify a change.
Stop was exercised after that review completed; this run does not claim in-flight cancellation of that request.
Reload returned the durable group to the recovery list, and opening it recovered Stopped state.
Reconciliation and the latest Hold decision remained visible.
No on-chain LP position was created by this browser journey.

The original database's existing Arbitrum draft was retained.
An earlier local BNB setup attempt created a stopped single-pair draft 4754a8b7-2063-4184-9a12-223d5baf7e61; it is not counted as the two-pair acceptance result.
No original group was deleted to make creation pass.

## Token identity display check

The final amount-label correction was checked with an Orca transport fixture that replayed the previously captured expired plan and supplied the current display generation.
This fixture changed only browser responses and did not mutate backend records or authorize execution.
The screenshot shows full contract addresses beside both USDC amounts.
The confirmation button remained disabled because the plan was expired.
A subsequent reload removed the fixture and recovered the actual stopped group.
This display-only replay is separate from the earlier real proposal and public simulation evidence.

## Controlled fork evidence

The existing verify-app-integration.ts and verify-external-adapter.ts scripts were rerun with temporary adjacent copies that changed only their evidence output paths.
The temporary copies were removed after execution and the original reports were not overwritten.
Source hashes and the evidence boundary are recorded in integrated-acceptance-observations.json.

The authenticated HTTP fixture exercised open, replacement, upward-only and cooldown refusals, close-only, and later conversion after group closure with explicit reviewed inventory.
It also checked rejection of unreviewed inventory and production receipt recovery.
The external adapter fixture exercised four scenarios: standard Arbitrum, bridged-token Arbitrum, BNB, and Robinhood.
Those scenarios included two-pair execution, forward and reverse fills, shared backing reduction, rollback, and receipt proof on controlled forks.
This is controlled provider and fork evidence, not a claim that MetaMask or another installed external wallet was tested.

## Validation and review

Existing runner checks passed: 13 runtime tests passed with 3 skipped, 16 service tests passed, and the service TypeScript check passed.
The frontend suite after the duplicate-group correction passed 160 tests with 1 skipped; lint and type checking also passed.
After concurrent Ethereum support landed, the final frontend lint, type check, and production build passed, while two existing signer assertions failed because they still expected three chains and rejection of chain 1.
Those failures were routed to the Ethereum implementation owner for correction.
The token-address change separately passed scoped ESLint and the full frontend type check.
No new unit tests were written.

Independent inspection of all three source commits was requested through the coordinator, including component boundaries, conventions, maintainability, and preservation of authorization and freshness checks.
Review request msg_2ddbaa86689d and the earlier pending question msg_c82897719949 identify the outstanding acceptance gate.
No independent approval is claimed in this report.

## Artifacts

- integrated-acceptance-observations.json contains sanitized browser, runner, configuration, and unsigned-plan evidence.
- integrated-acceptance-app-http-fork-results.json contains the authenticated lifecycle fork results.
- integrated-acceptance-external-adapter-fork.json contains the four controlled adapter scenarios.
- integrated-acceptance-validation.json records existing-check results and local log hashes.
- integrated-acceptance-plan-addresses.png is the explicitly labelled expired-plan display replay.
