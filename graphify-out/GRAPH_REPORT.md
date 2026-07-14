# Graph Report - /workspaces/Bandi  (2026-07-14)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 3035 nodes · 7992 edges · 117 communities (105 shown, 12 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 135 edges (avg confidence: 0.68)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `749fad84`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- live-browser.js
- checks.mjs
- createClient
- index.mjs
- mapping.ts
- initGlobalBar
- hook-lib.mjs
- detect-html.mjs
- modern-screenshot.umd.js
- types.ts
- index.ts
- live-inject.mjs
- setLiveState
- live-commit-manual-edits.mjs
- design-system.mjs
- el
- types.ts
- impeccable-config.mjs
- showToast
- detect-antipatterns-browser.js
- live-server.mjs
- page.tsx
- svelte-component.mjs
- hook-before-edit.mjs
- index.ts
- manual-apply.mjs
- dependencies
- hook-admin.mjs
- css-cascade.mjs
- live-wrap.mjs
- context.mjs
- HEADING_TAGS
- design-parser.mjs
- EntityProfile
- submit-url.ts
- live-accept.mjs
- extract-grants.ts
- live-copy-edit-agent.mjs
- compilerOptions
- detect-antipatterns.mjs
- SupabaseGrantsDb
- run.ts
- package.json
- live-manual-edit-evidence.mjs
- applyEditing
- live-poll.mjs
- page.tsx
- handleManualEditActivity
- StoredGrant
- insert-ui.mjs
- schema.ts
- database.types.ts
- collectVisualContrastCandidates
- parseRgb
- manual-edit-routes.mjs
- page.tsx
- discoverTargetCandidates
- openai-compat.test.ts
- constants.ts
- onAnnotDown
- readLiveServerInfo
- live.mjs
- impeccable-paths.mjs
- run-production.ts
- wizard.tsx
- parseAnyColor
- resolveLengthPx
- compilerOptions
- pipeline.test.ts
- constants.mjs
- refreshParamsPanel
- sampleCssBackground
- readConfig
- capacity.ts
- context-signals.mjs
- StaticElement
- event-validation.mjs
- critique-storage.mjs
- QueryStub
- normalizeIgnoreValueEntries
- ui-core.mjs
- session-store.mjs
- storico-match.ts
- ProfileRow
- collectBrowserFindings
- SAFE_TAGS
- palette.mjs
- pin.mjs
- inline-ignores.mjs
- resolveLiveInjectionAnchor
- helper.js
- render-graphs.js
- readWorkspacePatterns
- stop-server.sh
- serializeFindings
- package.json
- layout.tsx
- isScreenReaderOnlyTextStyle
- normalizeGitHubEvent
- acceptedDomAlreadyClean
- isGeneratedFile
- hitl-loop.template.sh
- manifest.ts
- detect.mjs
- session-start
- start-server.sh
- next.config.ts
- vercel.json
- review-package
- sdd-workspace
- task-brief
- find-polluter.sh
- postcss.config.mjs

## God Nodes (most connected - your core abstractions)
1. `el()` - 55 edges
2. `createClient()` - 42 edges
3. `runHook()` - 34 edges
4. `Grant` - 32 edges
5. `setLiveState()` - 29 edges
6. `EntityProfile` - 29 edges
7. `detectHtml()` - 28 edges
8. `initGlobalBar()` - 28 edges
9. `ExtractedGrant` - 28 edges
10. `collectBrowserFindings()` - 26 edges

## Surprising Connections (you probably didn't know these)
- `mockFetch()` --indirect_call--> `init()`  [INFERRED]
  scraper/tests/helpers/http.ts → .claude/skills/impeccable/scripts/live-browser.js
- `FilterBar()` --indirect_call--> `v()`  [INFERRED]
  app/src/components/grants/filter-bar.tsx → .claude/skills/impeccable/scripts/modern-screenshot.umd.js
- `normalizeUrl()` --indirect_call--> `v()`  [INFERRED]
  scraper/src/pipeline/dedup.ts → .claude/skills/impeccable/scripts/modern-screenshot.umd.js
- `normalizeUrl()` --indirect_call--> `k()`  [INFERRED]
  scraper/src/pipeline/dedup.ts → .claude/skills/impeccable/scripts/modern-screenshot.umd.js
- `fd()` --indirect_call--> `v()`  [INFERRED]
  app/src/app/(auth)/__tests__/actions.test.ts → .claude/skills/impeccable/scripts/modern-screenshot.umd.js

## Import Cycles
- None detected.

## Communities (117 total, 12 thin omitted)

### Community 0 - "live-browser.js"
Cohesion: 0.03
Nodes (127): addManualContextText(), applyGlobalBarLabelState(), applyPlaceholderSizingStyles(), applySvelteComponentVariantStyle(), averageRgb01(), bindEditBadgeProxy(), bufferToBase64(), buildCollapsible() (+119 more)

### Community 1 - "checks.mjs"
Cohesion: 0.05
Nodes (98): borderColorsFromStyle(), borderWidthsFromStyle(), checkClippedOverflow(), checkColors(), checkCreamPalette(), checkElementAIPaletteDOM(), checkElementClippedOverflow(), checkElementClippedOverflowDOM() (+90 more)

### Community 2 - "createClient"
Cohesion: 0.06
Nodes (54): IMieiBandiPage(), AppLayout(), OnboardingPage(), AuthState, deleteAccount(), italianAuthError(), requestPasswordReset(), signIn() (+46 more)

### Community 3 - "index.mjs"
Cohesion: 0.06
Nodes (68): addBrowserFindings(), addVisualContrastFindings(), addVisualContrastResult(), analyzeVisualContrast(), analyzeVisualContrastCandidate(), blendRgba(), browserColorsClose(), browserDesignSystemConfig() (+60 more)

### Community 4 - "mapping.ts"
Cohesion: 0.07
Nodes (33): isAuthorized(), GET(), handleDigest(), POST(), buildDigest(), Digest, DigestItem, escapeHtml() (+25 more)

### Community 5 - "initGlobalBar"
Cohesion: 0.08
Nodes (70): abortSvelteComponentInjection(), barPaletteForTheme(), brandMarkSvg(), cancelEditingToPicking(), cancelInsertConfigure(), cleanup(), cleanupAcceptedSession(), clearAnnotations() (+62 more)

### Community 6 - "hook-lib.mjs"
Cohesion: 0.07
Nodes (58): ACK_EXTS, bumpEditCount(), clampByte(), clampGroupedToBudget(), clampToBudget(), CO_SCAN_STYLE_NAMES, coLocatedStylesheets(), colorIgnoreKey() (+50 more)

### Community 7 - "detect-html.mjs"
Cohesion: 0.08
Nodes (46): mergeDesignSystemFindings(), detectUrl(), runVisualContrastFallback(), serializeDesignSystemForBrowser(), CSS_IN_JS_EXTENSIONS, detectText(), extFromFilePath(), extractCSSinJS() (+38 more)

### Community 8 - "modern-screenshot.umd.js"
Cohesion: 0.09
Nodes (55): fd(), fd(), ae(), be(), bt(), Ce(), Ct(), de() (+47 more)

### Community 9 - "types.ts"
Cohesion: 0.12
Nodes (29): BrowserlessConfig, anthropicGrants(), AnthropicProvider, FakeLLMProvider, GeminiProvider, geminiText(), GroqProvider, defaultFetch() (+21 more)

### Community 10 - "index.ts"
Cohesion: 0.11
Nodes (37): buildActions(), buildBreakdown(), LABELS, calculateMatch(), CAPACITY_MATRIX, DOCUMENT_KEYS, DocumentKey, groupForLegalType() (+29 more)

### Community 11 - "live-inject.mjs"
Cohesion: 0.07
Nodes (50): detectCsp(), INLINE_HEADER_SIGNALS, LAYOUT_EXTS, MONOREPO_HELPER_SIGNALS, NUXT_ROUTE_RULES_SIGNALS, NUXT_SECURITY_SIGNALS, SCAN_EXTS, SKIP_DIRS (+42 more)

### Community 12 - "setLiveState"
Cohesion: 0.07
Nodes (68): applyOriginalAttrsToSvelteAnchor(), applyPlaceholderDimensions(), applySavedSessionMeta(), buildInsertPlaceholderSnapshotFromDom(), buildPickedAnchorSnapshot(), cancelEditing(), captureAndEmit(), checkpointPayload() (+60 more)

### Community 13 - "live-commit-manual-edits.mjs"
Cohesion: 0.10
Nodes (50): allEntryIds(), argVal(), buildRepairBatch(), candidatesForEntry(), changedFilesSinceSnapshot(), clearAppliedEntries(), collectApplyOwnedFiles(), collectRollbackFiles() (+42 more)

### Community 14 - "design-system.mjs"
Cohesion: 0.10
Nodes (48): addColorObject(), addDesignColor(), addRoundedScale(), addRoundedToken(), addSidecarColors(), addSidecarRadii(), addTypographyFonts(), canonicalDesignFindingKey() (+40 more)

### Community 15 - "el"
Cohesion: 0.08
Nodes (48): actionLabel(), applyConfigureBarChrome(), bindConfigureCountPillTooltip(), bindConfigureInlineControlHover(), bindConfigureModifierPillHover(), buildConfigureActionControl(), buildConfigureCountControl(), buildConfigureRow() (+40 more)

### Community 16 - "types.ts"
Cohesion: 0.07
Nodes (23): computeBonuses(), BUDGET_MIDPOINT, BudgetBand, economicCoherence(), LABEL, cofundingIndicator(), economicIndicator(), none (+15 more)

### Community 17 - "impeccable-config.mjs"
Cohesion: 0.10
Nodes (47): applyDetectionConfigSource(), clampByte(), cleanIgnoreValueDisplay(), cloneDetectionConfig(), cloneRawDetectionConfig(), colorIgnoreKey(), DEFAULT_DETECTION_CONFIG, DETECTOR_CONFIG_KEYS (+39 more)

### Community 18 - "showToast"
Cohesion: 0.07
Nodes (58): armPageChatForTyping(), attachSteerFocusDebug(), attachSteerFocusGuard(), buildSteerProcessingDots(), clearSteerAwaitTimer(), clearSteerFocusRecoverTimer(), collapsePageChat(), configureVoiceContext() (+50 more)

### Community 19 - "detect-antipatterns-browser.js"
Cohesion: 0.09
Nodes (31): checkBorders(), checkClippedOverflow(), checkElementBorders(), checkElementBordersDOM(), checkElementClippedOverflow(), checkElementClippedOverflowDOM(), checkElementItalicSerif(), checkElementItalicSerifDOM() (+23 more)

### Community 20 - "live-server.mjs"
Cohesion: 0.09
Nodes (43): assembleLiveBrowserScript(), assertLiveBrowserScriptParts(), LIVE_BROWSER_SCRIPT_PARTS, readLiveBrowserScriptParts(), resolveLiveBrowserScriptParts(), acknowledgePendingEvent(), activeSessionSummaries(), agentPollingConnected() (+35 more)

### Community 21 - "page.tsx"
Cohesion: 0.12
Nodes (30): NuoviBandiPage(), DashboardPage(), DensityToggle(), EmptyState(), FilterBar(), GEOS, VERDICTS, setDensity() (+22 more)

### Community 22 - "svelte-component.mjs"
Cohesion: 0.10
Nodes (44): applyLegacyDeferredAcceptsOnStartup(), appendCssToSvelteStyle(), appendSanitizedCssRule(), applyDeferredSvelteComponentAccepts(), bakeParamValuesInCss(), buildInsertVariantStub(), buildPropContract(), buildPropsScript() (+36 more)

### Community 23 - "hook-before-edit.mjs"
Cohesion: 0.10
Nodes (42): allow(), bumpCursorDenial(), cursorBlockMessage(), deny(), detectProposedHtml(), done(), escapeRegExp(), findingSignature() (+34 more)

### Community 24 - "index.ts"
Cohesion: 0.12
Nodes (31): Phase, SubmitUrlDialog(), COLUMN_OF, GrantInsertRow, enrich(), inferGeoScope(), normalizeAmountString(), parseItalianAmount() (+23 more)

### Community 25 - "manual-apply.mjs"
Cohesion: 0.10
Nodes (36): addOpToManualApplyChunk(), APPLY_EVENT_HARD_TIMEOUT_MS, APPLY_EVENT_SOFT_DEADLINE_MS, buildManualApplyAgentAction(), clearManualApplyTransaction(), collectManualApplyFiles(), compactManualApplyBatch(), compactManualApplyCandidates() (+28 more)

### Community 26 - "dependencies"
Cohesion: 0.05
Nodes (39): dependencies, bandi-scraper, next, react, react-dom, @supabase/ssr, @supabase/supabase-js, zod (+31 more)

### Community 27 - "hook-admin.mjs"
Cohesion: 0.14
Nodes (39): ACTIONS, addIgnoreFile(), addIgnoreRule(), addIgnoreValue(), DETECTOR_CONFIG_KEYS, detectorSection(), fileHasImpeccableHookMarker(), HOOK_MANIFEST_TARGETS (+31 more)

### Community 28 - "css-cascade.mjs"
Cohesion: 0.10
Nodes (29): applyStaticDeclaration(), buildBorderOverrideMap(), buildStaticStyleMap(), collectStaticCssRules(), compareStaticPriority(), cssPropToCamel(), expandStaticBoxValues(), expandStaticDeclaration() (+21 more)

### Community 29 - "live-wrap.mjs"
Cohesion: 0.14
Nodes (34): argVal(), buildInsertWrapperLines(), computeInsertLine(), INSERT_POSITIONS, insertCli(), isInsertPosition(), resolveElementMatch(), buildSvelteComponentCssAuthoring() (+26 more)

### Community 30 - "context.mjs"
Cohesion: 0.10
Nodes (35): buildMissingTargetDirective(), buildResolvedContextDirective(), buildTargetSelectionDirective(), buildUpdateDirective(), cli(), compareSemver(), computeUpdateDirective(), contextSourcePath() (+27 more)

### Community 31 - "HEADING_TAGS"
Cohesion: 0.21
Nodes (12): checkElementHeroEyebrow(), checkElementHeroEyebrowDOM(), checkElementIconTile(), checkElementIconTileDOM(), checkHeroEyebrow(), checkIconTile(), isAccentColor(), isEmojiOnlyText() (+4 more)

### Community 32 - "design-parser.mjs"
Cohesion: 0.15
Nodes (33): buildColor(), CANONICAL_SECTIONS, collectBullets(), collectColorValues(), collectParagraphs(), detectFormat(), extractColors(), extractComponents() (+25 more)

### Community 33 - "EntityProfile"
Cohesion: 0.09
Nodes (24): POST(), consumeAnalysisQuota, getUser, AIAnalysisPanel(), SECTIONS, ANALYSIS_INSTRUCTIONS, ANALYSIS_JSON_SCHEMA, AnalysisProfileInput (+16 more)

### Community 34 - "submit-url.ts"
Cohesion: 0.10
Nodes (19): makeDb(), POST(), getUser, ConfirmResult, confirmSubmittedGrant(), DOC_SET, extractionDb(), isHttpUrl() (+11 more)

### Community 35 - "live-accept.mjs"
Cohesion: 0.14
Nodes (32): acceptCli(), argVal(), buildCarbonizeReplacement(), decodeHtmlAttr(), deindentContent(), detectCommentSyntax(), escapeRegExp(), expandReplaceRange() (+24 more)

### Community 36 - "extract-grants.ts"
Cohesion: 0.11
Nodes (25): BOUNDARY_TAGS, charDist(), coerce(), collectHrefs(), EXTRACT_INSTRUCTIONS, extractFromChunks(), extractGrants(), findBoundary() (+17 more)

### Community 37 - "live-copy-edit-agent.mjs"
Cohesion: 0.14
Nodes (31): applyMockWrites(), buildCopyEditBatchPrompt(), checkFrameworkSourceSyntax(), chooseCopyEditAgent(), COMMAND_AUTH_CACHE, commandAuthed(), commandExists(), compactBatchForPrompt() (+23 more)

### Community 38 - "compilerOptions"
Cohesion: 0.06
Nodes (30): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+22 more)

### Community 39 - "detect-antipatterns.mjs"
Cohesion: 0.16
Nodes (26): confirm(), detectCli(), formatFindings(), formatFindingSummary(), handleStdin(), printUsage(), loadDesignSystemForCwd(), parseFrontmatter() (+18 more)

### Community 40 - "SupabaseGrantsDb"
Cohesion: 0.12
Nodes (11): fail(), grantToInsertRow(), patchToUpdateRow(), rowToSourceConfig(), rowToStoredGrant(), SupabaseGrantsDb, loadEnabledSources(), QueryRecord (+3 more)

### Community 41 - "run.ts"
Cohesion: 0.11
Nodes (13): decide(), Decision, diffGrant(), equal(), isEmpty(), KEYS, normalizeUrl(), PipelineDeps (+5 more)

### Community 42 - "package.json"
Cohesion: 0.07
Nodes (27): dependencies, @supabase/supabase-js, zod, devDependencies, tsx, @types/node, typescript, vitest (+19 more)

### Community 43 - "live-manual-edit-evidence.mjs"
Cohesion: 0.16
Nodes (26): analyzeSourceHint(), buildCandidatesForOp(), buildContextHintsByRef(), buildManualEditEvidence(), collectSearchFiles(), countOps(), decodeBasicHtml(), escapeRegExp() (+18 more)

### Community 44 - "applyEditing"
Cohesion: 0.07
Nodes (37): applyEditing(), buildLocatorForLeaf(), buildPlaceholderResizeHandles(), canRestoreManualEditElement(), copyEditContainerContext(), copyEditLeafContext(), cssIdent(), cursorForPlaceholderEdge() (+29 more)

### Community 45 - "live-poll.mjs"
Cohesion: 0.18
Nodes (24): completionAckForAcceptResult(), completionTypeForAcceptResult(), augmentEventWithAcceptHandling(), buildAcceptScriptArgs(), buildPollReplyPayload(), EVENT_TYPES_NEEDING_AGENT_REPLY, fetchNextEvent(), fetchServerStatus() (+16 more)

### Community 46 - "page.tsx"
Cohesion: 0.18
Nodes (15): BandoDetailPage(), FUNDING_TYPE_LABELS, fundingTypeLabel(), AmountBadge(), DeadlineBadge(), DocumentChecklist(), GrantCard(), HistoryBadge() (+7 more)

### Community 47 - "handleManualEditActivity"
Cohesion: 0.18
Nodes (26): clearStoredManualApplyState(), handleManualEditActivity(), hasTextRows(), hidePendingApplyDock(), manualApplyLoadingText(), manualApplyStateKey(), manualEditEventForCurrentPage(), numberOrNull() (+18 more)

### Community 48 - "StoredGrant"
Cohesion: 0.10
Nodes (4): StoredGrant, DryRunGrantsDb, ThrowingDb, InMemoryGrantsDb

### Community 49 - "insert-ui.mjs"
Cohesion: 0.11
Nodes (10): canCreateInsert(), clampPlaceholderSize(), computeInsertPosition(), groupSiblingRows(), hitSiblingInsertGap(), horizontalOverlap(), insertCreateDisabledReason(), insertLineCoords() (+2 more)

### Community 50 - "schema.ts"
Cohesion: 0.15
Nodes (16): validateSection(), capacitySchema, contactsSchema, deriveRegion(), documentsSchema, historyRowSchema, historySchema, identitySchema (+8 more)

### Community 51 - "database.types.ts"
Cohesion: 0.11
Nodes (15): CompositeTypes, Constants, Database, DatabaseWithoutInternals, DefaultSchema, Enums, Json, Tables (+7 more)

### Community 52 - "collectVisualContrastCandidates"
Cohesion: 0.11
Nodes (23): addBrowserFindings(), addVisualContrastFindings(), addVisualContrastResult(), analyzeVisualContrast(), analyzeVisualContrastCandidate(), checkElementTextOverflowDOM(), classSelector(), clearOverlays() (+15 more)

### Community 53 - "parseRgb"
Cohesion: 0.24
Nodes (18): checkColors(), checkElementAIPaletteDOM(), checkElementColors(), checkElementColorsDOM(), checkElementGlow(), checkElementGlowDOM(), checkGlow(), colorToHex() (+10 more)

### Community 54 - "manual-edit-routes.mjs"
Cohesion: 0.19
Nodes (19): args, cwd, pageUrlFilter, remaining, compactManualLogText(), summarizeManualApplyFailures(), summarizeManualDiagnostics(), summarizeManualLogFile() (+11 more)

### Community 55 - "page.tsx"
Cohesion: 0.16
Nodes (15): ProfiloPage(), CompletionBar(), CheckboxField(), TextArea(), Answers, BUDGET, FUNDED, REPORT (+7 more)

### Community 56 - "discoverTargetCandidates"
Cohesion: 0.14
Nodes (22): directChildDirs(), discoverRootsForPattern(), discoverTargetCandidates(), escapeRegExp(), expandSimplePattern(), findTargetExample(), hasFallbackWorkspaceChildren(), isCandidateProjectRoot() (+14 more)

### Community 57 - "openai-compat.test.ts"
Cohesion: 0.16
Nodes (14): HttpRequest, noWait, source, bodyOf(), mockFetch(), mockResponse(), noWaitRetry, RecordedRequest (+6 more)

### Community 58 - "constants.ts"
Cohesion: 0.19
Nodes (13): MultiCheckbox(), SelectField(), TextField(), HistoryRow, SectionTerritory(), SectionThemes(), BENEFICIARY_OPTIONS, COFUNDING_OPTIONS (+5 more)

### Community 59 - "onAnnotDown"
Cohesion: 0.16
Nodes (20): beginEditPin(), buildAnnotationsForCapture(), buildPinElement(), cancelEditingPin(), clampPlaceholderSize(), finalizeEditingPin(), initAnnotOverlay(), localCoords() (+12 more)

### Community 60 - "readLiveServerInfo"
Cohesion: 0.21
Nodes (17): isLiveServerPidReachable(), readLiveServerInfo(), completeCli(), completeThroughServer(), parseArgs(), readServerInfo(), collectManualApplyFiles(), manualApplyReplyCommand() (+9 more)

### Community 61 - "live.mjs"
Cohesion: 0.19
Nodes (15): loadContext(), resolveTargetSelection(), safeRead(), parseTargetOptions(), parseTargetPath(), TargetArgError, __dirname, ensureServerRunning() (+7 more)

### Community 62 - "impeccable-paths.mjs"
Cohesion: 0.22
Nodes (18): resolveProjectRoot(), firstExisting(), getDesignSidecarCandidates(), getDesignSidecarPath(), getImpeccableDir(), getLegacyLiveAnnotationsDir(), getLegacyLiveConfigPath(), getLegacyLiveServerPath() (+10 more)

### Community 63 - "run-production.ts"
Cohesion: 0.20
Nodes (12): GET(), handleScrape(), POST(), main(), runPipeline(), getProvider(), isProviderName(), VALID (+4 more)

### Community 64 - "wizard.tsx"
Cohesion: 0.15
Nodes (13): OnboardingWizard(), STEPS, SectionForm(), SectionIdentity(), createProfile(), ProfileActionState, readSection(), updateProfileSection() (+5 more)

### Community 65 - "parseAnyColor"
Cohesion: 0.15
Nodes (19): borderColorsFromStyle(), borderWidthsFromStyle(), checkCreamPalette(), checkElementGptBorderShadow(), checkElementGptBorderShadowDOM(), checkElementQualityDOM(), checkGptThinBorderWideShadow(), checkQuality() (+11 more)

### Community 66 - "resolveLengthPx"
Cohesion: 0.18
Nodes (13): checkElementOversizedH1(), checkElementOversizedH1DOM(), checkElementQuality(), checkOversizedH1(), checkRepeatedSectionKickers(), checkRepeatedSectionKickersDOM(), checkRepeatedSectionKickersFromDoc(), cleanInlineText() (+5 more)

### Community 67 - "compilerOptions"
Cohesion: 0.11
Nodes (17): ES2022, node, tests, compilerOptions, esModuleInterop, forceConsistentCasingInFileNames, lib, module (+9 more)

### Community 68 - "pipeline.test.ts"
Cohesion: 0.18
Nodes (10): BrowserlessFetcher, PageFetcher, RawPage, SourceConfig, FixtureFetcher, makeDeps(), noSleep(), pageS1 (+2 more)

### Community 69 - "constants.mjs"
Cohesion: 0.15
Nodes (15): firstOverusedGoogleFont(), checkBorders(), checkElementBorders(), checkElementBordersDOM(), checkPageTypography(), checkTypography(), BORDER_SAFE_TAGS, BRAND_FONT_DOMAINS (+7 more)

### Community 70 - "refreshParamsPanel"
Cohesion: 0.17
Nodes (19): applyParamDefaults(), applyParamValue(), buildParamsPanel(), closedClipPath(), closeTunePopover(), formatRangeValue(), getVisibleVariantEl(), hideParamsPanel() (+11 more)

### Community 71 - "sampleCssBackground"
Cohesion: 0.18
Nodes (16): blendRgba(), clampByte(), firstCssUrl(), getLayerValue(), loadVisualContrastImage(), parseObjectPosition(), parsePositionPair(), parsePositionToken() (+8 more)

### Community 72 - "readConfig"
Cohesion: 0.16
Nodes (14): applyConfigSource(), applyDetectorConfigSource(), cloneDefaultConfig(), detectorSection(), hookSection(), mergeExtensions(), normalizeExtensionEntries(), numberOr() (+6 more)

### Community 73 - "capacity.ts"
Cohesion: 0.19
Nodes (8): BUDGET, calculateCapacity(), FUNDED, REPORT, scoreCapacity(), STAFF, maxAnswers, CapacityAnswers

### Community 74 - "context-signals.mjs"
Cohesion: 0.25
Nodes (12): extractRegister(), cli(), COMMON_DEV_PORTS, devServerSignals(), gatherSignals(), gitSignals(), hasCode(), latestCritique() (+4 more)

### Community 76 - "event-validation.mjs"
Cohesion: 0.26
Nodes (12): FORBIDDEN_MANUAL_EDIT_TEXT_CHARS, INSERT_POSITIONS, isValidId(), isValidVariantId(), validateAnnotationFields(), validateEvent(), validateInsertGenerate(), validateManualEditEvent() (+4 more)

### Community 77 - "critique-storage.mjs"
Cohesion: 0.32
Nodes (11): kebab(), listSnapshotsForSlug(), main(), nowFilenameStamp(), parseFrontmatter(), readLatestSnapshot(), readTrend(), serializeFrontmatter() (+3 more)

### Community 79 - "normalizeIgnoreValueEntries"
Cohesion: 0.27
Nodes (12): cleanIgnoreValueDisplay(), extractFindingIgnoreValue(), extractFindingIgnoreValueRaw(), extractMotionIgnoreValue(), filterFindings(), formatFindingIgnoreCommand(), ignoreValueFilesKey(), isIgnoredFindingValue() (+4 more)

### Community 80 - "ui-core.mjs"
Cohesion: 0.23
Nodes (10): createLiveBrowserDomHelpers(), activeElementDeep(), appendStyleToLiveUiRoot(), appendToLiveUiRoot(), escapeCssIdent(), getLiveUiElementById(), LIVE_CHROME_MOUNT_CONTRACT, LIVE_UI_COMPONENT_IDS (+2 more)

### Community 81 - "session-store.mjs"
Cohesion: 0.27
Nodes (9): applyEvent(), baseSnapshot(), COMPLETED_PHASES, getJournalPath(), getSnapshotPath(), rebuildSnapshotFromJournal(), safeSessionId(), toPendingEvent() (+1 more)

### Community 82 - "storico-match.ts"
Cohesion: 0.31
Nodes (7): LABEL, levenshtein(), matchHistory(), nameSimilarity(), normalizeName(), HistoryBadgeKind, ProjectHistoryRow

### Community 83 - "ProfileRow"
Cohesion: 0.22
Nodes (7): CompletionSuggestion, isFilled(), SUGGESTION_TEXT, WEIGHTED, buildCapacity(), hasAllCapacityAnswers(), ProfileRow

### Community 84 - "collectBrowserFindings"
Cohesion: 0.12
Nodes (19): browserColorsClose(), browserDesignSystemConfig(), browserFindingsFromMap(), browserHasDirectText(), browserPrimaryFont(), browserRadiusTokens(), browserSampleText(), checkBrowserDesignSystemSources() (+11 more)

### Community 85 - "SAFE_TAGS"
Cohesion: 0.28
Nodes (9): checkElementMotion(), checkElementMotionDOM(), checkLayout(), checkMotion(), checkPageLayout(), isCardLike(), isCardLikeDOM(), isCardLikeFromProps() (+1 more)

### Community 86 - "palette.mjs"
Cohesion: 0.24
Nodes (7): args, buildWeights(), hashUnit(), pickSeed(), seed, SEEDS, weightedPick()

### Community 87 - "pin.mjs"
Cohesion: 0.25
Nodes (9): __dirname, findHarnessDirs(), generatePinnedSkill(), HARNESS_DIRS, loadCommandMetadata(), pin(), root, unpin() (+1 more)

### Community 88 - "inline-ignores.mjs"
Cohesion: 0.40
Nodes (9): addRules(), applyInlineIgnores(), getSet(), hasDirectives(), isInlineIgnored(), normalizeRule(), parseInlineIgnores(), parseRuleList() (+1 more)

### Community 89 - "resolveLiveInjectionAnchor"
Cohesion: 0.62
Nodes (7): elementMatchesOriginalMarkup(), findLiveElementForOriginalMarkup(), findLiveElementFromAnchorSnapshot(), isUsableInjectionAnchor(), normalizeElementClassName(), parseOriginalMarkupElement(), resolveLiveInjectionAnchor()

### Community 90 - "helper.js"
Cohesion: 0.42
Nodes (7): connect(), nextReconnectDelay(), reloadAfterRecovery(), sessionKey(), setStatus(), showTombstone(), websocketUrl()

### Community 91 - "render-graphs.js"
Cohesion: 0.33
Nodes (8): combineGraphs(), { execSync }, extractDotBlocks(), extractGraphBody(), fs, main(), path, renderToSvg()

### Community 92 - "readWorkspacePatterns"
Cohesion: 0.32
Nodes (8): parseYamlFlowList(), readJson(), readLernaWorkspaces(), readPackageWorkspaces(), readPnpmWorkspaces(), readWorkspacePatterns(), stripYamlInlineComment(), unquoteYamlValue()

### Community 93 - "stop-server.sh"
Cohesion: 0.43
Nodes (4): command_has_server_id(), is_brainstorm_server(), mark_stopped(), stop-server.sh script

### Community 94 - "serializeFindings"
Cohesion: 0.25
Nodes (9): buildSelectorSegment(), generateSelector(), isElementHidden(), isLikelyHashedClass(), postSerializedFindings(), renderBrowserFindings(), scanResultMeta(), serializeFindings() (+1 more)

### Community 95 - "package.json"
Cohesion: 0.29
Nodes (6): name, private, version, workspaces, app, scraper

### Community 96 - "layout.tsx"
Cohesion: 0.33
Nodes (4): geistMono, geistSans, metadata, viewport

### Community 97 - "isScreenReaderOnlyTextStyle"
Cohesion: 0.47
Nodes (6): clippedByInset(), clippedByRect(), expandBoxShorthand(), firstMetricLengthPx(), isScreenReaderOnlyTextStyle(), metricLengthPx()

### Community 98 - "normalizeGitHubEvent"
Cohesion: 0.47
Nodes (6): applyPatchText(), envProjectDir(), looksLikeApplyPatch(), normalizeGitHubEvent(), normalizeHookEvent(), parseGitHubToolArgs()

### Community 99 - "acceptedDomAlreadyClean"
Cohesion: 0.53
Nodes (6): acceptedDomAlreadyClean(), ensureAcceptedDomClean(), findAcceptedRuntimeWrappers(), reloadAfterMissingAcceptedDom(), restoreAcceptedDomFromSnapshot(), scheduleAcceptCleanup()

### Community 100 - "isGeneratedFile"
Cohesion: 0.53
Nodes (5): hasGeneratedHeader(), HEADER_MARKERS, isGeneratedFile(), isGitIgnored(), searchDir()

### Community 101 - "hitl-loop.template.sh"
Cohesion: 0.83
Nodes (3): capture(), hitl-loop.template.sh script, step()

### Community 104 - "detect.mjs"
Cohesion: 0.50
Nodes (3): candidates, detectorPath, __dirname

## Knowledge Gaps
- **299 isolated node(s):** `find-polluter.sh script`, `fs`, `path`, `{ execSync }`, `COMMON_DEV_PORTS` (+294 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `v()` connect `modern-screenshot.umd.js` to `design-parser.mjs`, `live-browser.js`, `refreshParamsPanel`, `run.ts`, `context-signals.mjs`, `page.tsx`, `css-cascade.mjs`, `HEADING_TAGS`?**
  _High betweenness centrality (0.350) - this node is a cross-community bridge._
- **Why does `normalizeUrl()` connect `run.ts` to `index.ts`, `modern-screenshot.umd.js`, `submit-url.ts`?**
  _High betweenness centrality (0.180) - this node is a cross-community bridge._
- **Why does `FilterBar()` connect `page.tsx` to `modern-screenshot.umd.js`?**
  _High betweenness centrality (0.131) - this node is a cross-community bridge._
- **Are the 29 inferred relationships involving `el()` (e.g. with `browserFindingsFromMap()` and `collectVisualContrastCandidates()`) actually correct?**
  _`el()` has 29 INFERRED edges - model-reasoned connections that need verification._
- **What connects `find-polluter.sh script`, `fs`, `path` to the rest of the system?**
  _299 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `live-browser.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0319618366129994 - nodes in this community are weakly interconnected._
- **Should `checks.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.04554455445544554 - nodes in this community are weakly interconnected._