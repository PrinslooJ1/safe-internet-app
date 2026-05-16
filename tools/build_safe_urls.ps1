Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$TargetCount = 2000
$CandidateLimit = 12000
$CiscoLimit = 500000
$TimeoutSec = 2
$ThrottleLimit = 60
$BatchSize = 300

$CiscoUrl = 'http://s3-us-west-1.amazonaws.com/umbrella-static/top-1m.csv.zip'

$UnsafeDomainPattern = '(adult|casino|gambl|betting|poker|slots|lottery|lotto|bingo|xxx|porn|sex|escort|dating|hookup|onlyfans|chaturbate|xvideos|xnxx|youporn|redtube|brazzers|hentai|erotic|nude|strip|camgirl|webcam|vodka|beer|wine|cannabis|weed)'
$InfrastructureDomainPattern = '(^|[.-])(api|apis|cdn|static|assets|analytics|tagmanager|tracking|telemetry|updates?|windowsupdate|gvt\d?|edgekey|edgesuite|azureedge|cloudfront|akadns|akamai|fastly|sentry|newrelic|datadog|doubleverify|metrics|pixel|beacon|collector|logs?|microsoftonline|sharepoint|ipv4only)([.-]|$)'
$UnsafeContentPattern = '\b(casino|gambling|betting|poker|slots|porn|xxx|adult\s+content|escort|onlyfans|nude|hentai|erotic|hookup|suicide|self[- ]?harm|murder|terrorist?|weapons?|firearms?|vaping|tobacco)\b'

$BlockedDomains = @(
  'facebook.com', 'instagram.com', 'tiktok.com', 'x.com', 'twitter.com',
  'reddit.com', 'discord.com', 'snapchat.com', 'telegram.org', 'whatsapp.com',
  'twitch.tv', 'youtube.com', 'youtu.be', 'dailymotion.com', '4chan.org',
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'scorecardresearch.com', 'taboola.com', 'outbrain.com', 'adnxs.com',
  'amazonaws.com', 'cloudfront.net', 'googleusercontent.com', 'gstatic.com',
  'akamaihd.net', 'akamaiedge.net', 'fastly.net',
  'googleapis.com', 'googleapis.cn', 'googletagmanager.com', 'google-analytics.com',
  'windowsupdate.com', 'microsoftonline.com', 'microsoftonline.us', 'office.net',
  'windows.net', 'sharepoint.com', 'sharepointonline.com', 'ipv4only.arpa',
  'ytimg.com', 'sfx.ms', 'apple-dns.net', 'aaplimg.com'
)

$AdultTlds = @('adult', 'arpa', 'bet', 'bingo', 'casino', 'dating', 'poker', 'porn', 'sex', 'sexy', 'vodka', 'webcam', 'wine', 'xxx')
$SpecialSecondLevelSuffixes = @(
  'ac.uk', 'co.uk', 'gov.uk', 'ltd.uk', 'me.uk', 'net.uk', 'nhs.uk', 'org.uk', 'plc.uk', 'sch.uk',
  'asn.au', 'com.au', 'edu.au', 'gov.au', 'net.au', 'org.au',
  'ac.nz', 'co.nz', 'geek.nz', 'govt.nz', 'iwi.nz', 'kiwi.nz', 'net.nz', 'org.nz', 'school.nz',
  'ac.za', 'co.za', 'edu.za', 'gov.za', 'net.za', 'org.za', 'school.za',
  'ac.jp', 'co.jp', 'go.jp', 'ne.jp', 'or.jp',
  'com.br', 'com.cn', 'com.hk', 'com.mx', 'com.sg', 'com.tr',
  'edu.cn', 'edu.hk', 'edu.sg', 'gov.br', 'gov.cn', 'gov.sg', 'net.cn', 'org.cn'
)

$RequiredDomains = @(
  @{ Domain = 'jw.org'; Category = 'Learning'; Rank = 0 }
)

$CategoryOverrides = @{
  'jw.org' = 'Learning'
  'khanacademy.org' = 'Learning'
  'duolingo.com' = 'Learning'
  'coursera.org' = 'Learning'
  'edx.org' = 'Learning'
  'udemy.com' = 'Learning'
  'wikipedia.org' = 'Research'
  'wikimedia.org' = 'Research'
  'archive.org' = 'Research'
  'britannica.com' = 'Research'
  'duckduckgo.com' = 'Search'
  'google.com' = 'Search'
  'bing.com' = 'Search'
  'yahoo.com' = 'Search'
  'merriam-webster.com' = 'Reference'
  'dictionary.com' = 'Reference'
  'thesaurus.com' = 'Reference'
}

function Get-RegisteredDomain {
  param([string]$HostName)

  if ([string]::IsNullOrWhiteSpace($HostName)) { return $null }
  $hostName = $HostName.Trim().ToLowerInvariant()
  $hostName = $hostName -replace '^https?://', ''
  $hostName = $hostName -replace '/.*$', ''
  $hostName = $hostName -replace ':\d+$', ''
  $hostName = $hostName.TrimEnd('.')
  $hostName = $hostName -replace '^www\d*\.', ''

  if ($hostName -match '^\d{1,3}(\.\d{1,3}){3}$') { return $null }
  if ($hostName -match ':') { return $null }
  if ($hostName -in @('localhost', 'local')) { return $null }

  $parts = @($hostName.Split('.') | Where-Object { $_ })
  if ($parts.Count -lt 2) { return $null }

  $lastLabel = $parts[-1]
  if ($lastLabel -notmatch '^[a-z][a-z0-9-]{1,62}$') { return $null }

  $lastTwo = ($parts[($parts.Count - 2)..($parts.Count - 1)] -join '.')
  if ($SpecialSecondLevelSuffixes -contains $lastTwo -and $parts.Count -ge 3) {
    return ($parts[($parts.Count - 3)..($parts.Count - 1)] -join '.')
  }

  return $lastTwo
}

function Test-DomainShape {
  param([string]$Domain)

  $root = Get-RegisteredDomain $Domain
  if (-not $root) { return $false }
  if ($root -match $UnsafeDomainPattern) { return $false }
  if ($root -match $InfrastructureDomainPattern) { return $false }

  $tld = ($root.Split('.')[-1]).ToLowerInvariant()
  if ($AdultTlds -contains $tld) { return $false }

  foreach ($blocked in $BlockedDomains) {
    if ($root -eq $blocked -or $root.EndsWith(".$blocked")) { return $false }
  }

  return $true
}

function Get-Category {
  param([string]$Domain)

  if ($CategoryOverrides.ContainsKey($Domain)) { return $CategoryOverrides[$Domain] }

  $labels = $Domain.Split('.')
  $tld = $labels[-1]
  $target = $Domain.ToLowerInvariant()

  if ($tld -eq 'edu' -or $target -match '(school|academy|college|university|course|learn|education|student|teacher|lesson|math|science)') { return 'Learning' }
  if ($tld -eq 'gov' -or $target -match '(^|\.)gov\.|government|parliament|congress|senate|state\.|city\.|county\.') { return 'Government' }
  if ($target -match '(wikipedia|wiktionary|wikibooks|wikimedia|britannica|archive|library|dictionary|thesaurus|reference|worldcat)') { return 'Reference' }
  if ($target -match '(news|bbc|cnn|reuters|guardian|nytimes|washingtonpost|npr|pbs|time|bloomberg|forbes|apnews|usatoday|wsj|economist)') { return 'News' }
  if ($target -match '(nasa|nih|noaa|who|cdc|science|nature|museum|research|nationalgeographic|smithsonian|cern|observatory)') { return 'Research' }
  if ($target -match '(health|medical|medicine|mayo|webmd|clinic|hospital|doctor|wellness)') { return 'Health' }
  if ($target -match '(google|bing|duckduckgo|search|yahoo|yandex|baidu)') { return 'Search' }
  if ($target -match '(github|stackoverflow|stackexchange|microsoft|apple|adobe|mozilla|wordpress|cloudflare|ubuntu|linux|android|developer|openai|oracle|ibm|intel|nvidia|amd|salesforce|sap|atlassian)') { return 'Technology' }
  if ($target -match '(amazon|ebay|etsy|walmart|target|shop|store|ikea|costco|retail|marketplace|aliexpress|shopify)') { return 'Shopping' }
  if ($target -match '(bank|paypal|visa|mastercard|stripe|finance|financial|invest|market|nasdaq|nyse|credit|money)') { return 'Finance' }
  if ($target -match '(travel|trip|booking|airbnb|hotel|flight|airline|airport|uber|lyft|maps)') { return 'Travel' }
  if ($target -match '(art|music|design|canva|figma|dribbble|behance|creative|photo|sketch|drawing|craft)') { return 'Creative' }
  if ($target -match '(game|games|chess|lego|play|toy|kids)') { return 'Games' }
  if ($target -match '(book|books|read|reading|literacy|story|stories|poetry)') { return 'Reading' }
  if ($target -match '(mind|mental|psych|therapy|counsel|wellbeing)') { return 'Mental Health' }
  if ($target -match '(tool|calculator|convert|translate|weather|calendar|docs|forms|office|notion)') { return 'Tools' }

  return 'Business'
}

function Add-RankedDomain {
  param(
    [hashtable]$Map,
    [string]$Domain,
    [string]$Source,
    [int]$Rank,
    [string]$ForcedCategory = ''
  )

  $root = Get-RegisteredDomain $Domain
  if (-not $root -or -not (Test-DomainShape $root)) { return }

  if (-not $Map.ContainsKey($root)) {
    $Map[$root] = [ordered]@{
      Domain = $root
      CiscoRank = [int]::MaxValue
      MajesticRank = [int]::MaxValue
      RequiredRank = [int]::MaxValue
      ForcedCategory = ''
    }
  }

  if ($Source -eq 'Cisco' -and $Rank -lt $Map[$root]['CiscoRank']) { $Map[$root]['CiscoRank'] = $Rank }
  if ($Source -eq 'Majestic' -and $Rank -lt $Map[$root]['MajesticRank']) { $Map[$root]['MajesticRank'] = $Rank }
  if ($Source -eq 'Required' -and $Rank -lt $Map[$root]['RequiredRank']) { $Map[$root]['RequiredRank'] = $Rank }
  if ($ForcedCategory) { $Map[$root]['ForcedCategory'] = $ForcedCategory }
}

function Invoke-Download {
  param([string]$Url, [string]$OutFile)
  Invoke-WebRequest -Uri $Url -OutFile $OutFile -TimeoutSec 180 -MaximumRedirection 5 -UseBasicParsing -Headers @{
    'User-Agent' = 'SafeInternetAppDomainBuilder/2.0'
  }
}

function Get-CiscoRows {
  param([string]$ZipPath, [string]$WorkDir)

  if (Test-Path $WorkDir) { Remove-Item -LiteralPath $WorkDir -Recurse -Force }
  New-Item -ItemType Directory -Path $WorkDir | Out-Null
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [System.IO.Compression.ZipFile]::ExtractToDirectory($ZipPath, $WorkDir)
  return Get-ChildItem -Path $WorkDir -Filter '*.csv' | Select-Object -First 1
}

function Get-HomepageVariants {
  param([string]$Domain)
  @("https://$Domain/", "https://www.$Domain/")
}

Write-Host 'Downloading public popularity ranking data...'
$TempDir = Join-Path ([System.IO.Path]::GetTempPath()) ('safe-internet-domain-build-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $TempDir | Out-Null
$CiscoZip = Join-Path $TempDir 'top-1m.csv.zip'
$CachedCiscoCsv = Join-Path $Root 'tools\cache\top-1m.csv'

try {
  if (Test-Path $CachedCiscoCsv) {
    Write-Host "Using cached Cisco ranking data at $CachedCiscoCsv"
    $CiscoCsv = Get-Item $CachedCiscoCsv
  } else {
    Invoke-Download -Url $CiscoUrl -OutFile $CiscoZip
    $CiscoCsv = Get-CiscoRows -ZipPath $CiscoZip -WorkDir (Join-Path $TempDir 'cisco')
  }

  $DomainMap = @{}

  foreach ($required in $RequiredDomains) {
    Add-RankedDomain -Map $DomainMap -Domain $required.Domain -Source 'Required' -Rank $required.Rank -ForcedCategory $required.Category
  }

  Write-Host 'Parsing Cisco Umbrella popularity ranks...'
  $count = 0
  foreach ($line in [System.IO.File]::ReadLines($CiscoCsv.FullName)) {
    if ($count -ge $CiscoLimit) { break }
    $parts = $line.Split(',', 2)
    if ($parts.Count -ne 2) { continue }
    $rank = 0
    if (-not [int]::TryParse($parts[0], [ref]$rank)) { continue }
    Add-RankedDomain -Map $DomainMap -Domain $parts[1] -Source 'Cisco' -Rank $rank
    $count++
  }

  $Candidates = foreach ($entry in $DomainMap.Values) {
    $required = $entry['RequiredRank']
    $cisco = $entry['CiscoRank']
    $majestic = $entry['MajesticRank']
    $score = if ($cisco -eq [int]::MaxValue) { [double]::MaxValue } else { [double]$cisco }
    if ($required -ne [int]::MaxValue) { $score = $required }
    [pscustomobject]@{
      Domain = $entry['Domain']
      Score = $score
      CiscoRank = $cisco
      MajesticRank = $majestic
      ForcedCategory = $entry['ForcedCategory']
    }
  }

  $Candidates = $Candidates |
    Sort-Object Score, CiscoRank, MajesticRank, Domain |
    Select-Object -First $CandidateLimit

  Write-Host "Collected $($DomainMap.Count) unique safe-shaped domains; verifying up to $($Candidates.Count) homepages..."

  $VerifiedList = [System.Collections.Generic.List[object]]::new()
  $VerifiedDomains = @{}
  $ProgressPath = Join-Path $Root 'verified-homepages.jsonl'
  if (Test-Path $ProgressPath) { Remove-Item -LiteralPath $ProgressPath -Force }

  for ($offset = 0; $offset -lt $Candidates.Count -and $VerifiedList.Count -lt $TargetCount; $offset += $BatchSize) {
    $end = [Math]::Min($offset + $BatchSize - 1, $Candidates.Count - 1)
    $batch = @($Candidates[$offset..$end])
    Write-Host ("  verifying ranked candidates {0}-{1}; verified so far {2}" -f ($offset + 1), ($end + 1), $VerifiedList.Count)

    $batchVerified = $batch | ForEach-Object -Parallel {
    $unsafeContentPattern = $using:UnsafeContentPattern
    $unsafeDomainPattern = $using:UnsafeDomainPattern
    $blockedDomains = $using:BlockedDomains
    $timeoutSec = $using:TimeoutSec
    $domain = $_.Domain

    function Test-BlockedRootParallel {
      param([string]$Root)
      if ($Root -match $unsafeDomainPattern) { return $true }
      foreach ($blocked in $blockedDomains) {
        if ($Root -eq $blocked -or $Root.EndsWith(".$blocked")) { return $true }
      }
      return $false
    }

    function Test-FinalHostParallel {
      param([string]$FinalUrl, [string]$RootDomain)
      if ([string]::IsNullOrWhiteSpace($FinalUrl)) { return $true }
      try {
        $finalHost = ([Uri]$FinalUrl).Host.Trim().ToLowerInvariant() -replace '^www\d*\.', ''
        return ($finalHost -eq $RootDomain -or $finalHost.EndsWith(".$RootDomain"))
      } catch {
        return $false
      }
    }

    foreach ($url in @("https://$domain/", "https://www.$domain/")) {
      try {
        $curlOutput = & curl.exe --head --location --silent --output NUL --write-out '%{http_code} %{url_effective}' --max-time $timeoutSec --user-agent 'SafeInternetAppLinkChecker/2.0' $url 2>$null
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($curlOutput)) { continue }

        $parts = ([string]$curlOutput).Trim() -split '\s+', 2
        if ($parts.Count -lt 1) { continue }
        $status = 0
        if (-not [int]::TryParse($parts[0], [ref]$status)) { continue }
        if ($status -lt 200 -or $status -ge 300) { continue }

        $finalUrl = if ($parts.Count -gt 1) { $parts[1] } else { $url }
        if (-not (Test-FinalHostParallel -FinalUrl $finalUrl -RootDomain $domain)) { continue }
        if (Test-BlockedRootParallel -Root $domain) { continue }

        [pscustomobject]@{
          Domain = $domain
          Url = $url
          Status = $status
          Score = $_.Score
          CiscoRank = $_.CiscoRank
          MajesticRank = $_.MajesticRank
          ForcedCategory = $_.ForcedCategory
          Safety = 'passed-domain-safety-screen'
        }
        return
      } catch {
        # Try the next homepage variant.
      }
    }
    } -ThrottleLimit $ThrottleLimit

    foreach ($item in ($batchVerified | Where-Object { $_ } | Sort-Object Score, CiscoRank, MajesticRank, Domain)) {
      if ($VerifiedList.Count -ge $TargetCount) { break }
      if (-not $VerifiedDomains.ContainsKey($item.Domain)) {
        $VerifiedDomains[$item.Domain] = $true
        $VerifiedList.Add($item)
        ($item | ConvertTo-Json -Compress) | Add-Content -Path $ProgressPath -Encoding utf8NoBOM
      }
    }
  }

  $Verified = $VerifiedList |
    Where-Object { $_ } |
    Sort-Object Score, CiscoRank, MajesticRank, Domain -Unique

  if ($Verified.Count -lt $TargetCount) {
    throw "Only verified $($Verified.Count) domains; target is $TargetCount. Increase CandidateLimit or relax filters."
  }

  $Selected = $Verified | Select-Object -First $TargetCount

  $OutputItems = foreach ($item in $Selected) {
    $category = if ($item.ForcedCategory) { $item.ForcedCategory } else { Get-Category -Domain $item.Domain }
    [pscustomobject]@{
      url = $item.Url
      category = $category
      domain = $item.Domain
      status = $item.Status
      ciscoRank = if ($item.CiscoRank -eq [int]::MaxValue) { $null } else { $item.CiscoRank }
      majesticRank = if ($item.MajesticRank -eq [int]::MaxValue) { $null } else { $item.MajesticRank }
      safety = $item.Safety
    }
  }

  $GeneratedAt = Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'
  $txtLines = [System.Collections.Generic.List[string]]::new()
  $txtLines.Add('# Safe Internet App URL list')
  $txtLines.Add("# Generated: $GeneratedAt")
  $txtLines.Add('# Format: Homepage URL | Category')
  $txtLines.Add('# Criteria: one homepage per registered domain; ranked from Cisco Umbrella popularity data; excludes adult/gambling/social/ad-network domain patterns; final homepages returned HTTP 200.')
  $txtLines.Add("# Source: Cisco Umbrella $CiscoUrl")
  $txtLines.Add('')
  foreach ($item in $OutputItems) {
    $txtLines.Add(('{0} | {1}' -f $item.url, $item.category))
  }
  [System.IO.File]::WriteAllLines((Join-Path $Root 'urls.txt'), $txtLines, [System.Text.UTF8Encoding]::new($false))

  $jsItems = $OutputItems | ForEach-Object {
    [pscustomobject]@{
      url = $_.url
      category = $_.category
    }
  }
  $json = $jsItems | ConvertTo-Json -Depth 4
  $js = "// Generated by tools/build_safe_urls.ps1. Keep urls.txt in sync if editing by hand.`nwindow.SAFE_URLS = $json;`n"
  [System.IO.File]::WriteAllText((Join-Path $Root 'urls.js'), $js, [System.Text.UTF8Encoding]::new($false))

  $report = [ordered]@{
    generatedAt = $GeneratedAt
    count = $OutputItems.Count
    target = $TargetCount
    candidateLimit = $CandidateLimit
    rankingSources = @(
      [ordered]@{ name = 'Cisco Umbrella Popularity List'; url = $CiscoUrl; parsedRows = $CiscoLimit }
    )
    requiredDomains = $RequiredDomains
    categories = [ordered]@{}
    statuses = [ordered]@{}
    distinctDomains = ($OutputItems.domain | Sort-Object -Unique).Count
    homepageOnly = $true
    duplicateDomains = 0
    safetyMethod = 'Automated domain blocklist for adult, gambling, social, and ad-network patterns. This is a screening pass, not a legal/content-rating certification.'
  }

  foreach ($item in $OutputItems) {
    if (-not $report.categories.Contains($item.category)) { $report.categories[$item.category] = 0 }
    $report.categories[$item.category]++
    $statusKey = [string]$item.status
    if (-not $report.statuses.Contains($statusKey)) { $report.statuses[$statusKey] = 0 }
    $report.statuses[$statusKey]++
  }

  $domainGroups = $OutputItems.domain | Group-Object | Where-Object { $_.Count -gt 1 }
  $report.duplicateDomains = @($domainGroups).Count

  $report | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $Root 'url-check-report.json') -Encoding utf8NoBOM
  Write-Host "Wrote $($OutputItems.Count) homepage-only verified domains to urls.txt and urls.js."
} finally {
  if (Test-Path $TempDir) {
    Remove-Item -LiteralPath $TempDir -Recurse -Force -ErrorAction SilentlyContinue
  }
}
