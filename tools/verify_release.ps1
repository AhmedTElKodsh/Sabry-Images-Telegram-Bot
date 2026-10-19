param(
  [string]$EvidencePath = '_bmad-output/implementation-artifacts/release-verification-current.json'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
  $checks = Get-ChildItem -LiteralPath 'tests' -Filter '*_check.js' | Sort-Object Name
  $results = @()
  foreach ($check in $checks) {
    & node $check.FullName
    if ($LASTEXITCODE -ne 0) { throw "Verification failed: $($check.Name)" }
    $results += [ordered]@{ check = "tests/$($check.Name)"; status = 'PASS' }
  }

  Get-Content -Raw -LiteralPath 'apps-script/Code.gs' | node --check -
  if ($LASTEXITCODE -ne 0) { throw 'Apps Script syntax validation failed.' }
  $results += [ordered]@{ check = 'apps-script/Code.gs syntax'; status = 'PASS' }

  & node --check 'tools/evaluate_semantic_retrieval.js'
  if ($LASTEXITCODE -ne 0) { throw 'Semantic evaluator syntax validation failed.' }
  $results += [ordered]@{ check = 'tools/evaluate_semantic_retrieval.js syntax'; status = 'PASS' }

  & git diff --check
  if ($LASTEXITCODE -ne 0) { throw 'Git whitespace validation failed.' }
  $results += [ordered]@{ check = 'git diff --check'; status = 'PASS' }

  $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath 'apps-script/Code.gs').Hash.ToLowerInvariant()
  $manifest = [ordered]@{
    generated_at_utc = [DateTime]::UtcNow.ToString('o')
    commit = (& git rev-parse HEAD).Trim()
    branch = (& git branch --show-current).Trim()
    apps_script_sha256 = $sourceHash
    working_tree_porcelain = @(& git status --porcelain)
    checks = $results
    evidence_boundaries = [ordered]@{
      local = 'PASS'
      github = 'UNVERIFIED_BY_LOCAL_RUN'
      apps_script_editor = 'UNVERIFIED_BY_LOCAL_RUN'
      immutable_deployment = 'UNVERIFIED_BY_LOCAL_RUN'
      live_telegram_acceptance = 'UNVERIFIED_BY_LOCAL_RUN'
      independent_account_restore = 'PENDING_EXTERNAL_GATE'
      privacy_and_semantic_quality = 'PENDING_EXTERNAL_GATE'
    }
  }
  $parent = Split-Path -Parent $EvidencePath
  if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $EvidencePath -Encoding utf8
  Write-Output "PASS: $($results.Count) checks; Apps Script SHA-256 $sourceHash"
  Write-Output "Evidence: $((Resolve-Path -LiteralPath $EvidencePath).Path)"
} finally {
  Pop-Location
}
