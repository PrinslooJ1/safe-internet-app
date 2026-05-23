Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$CsvPath = Join-Path $ProjectRoot 'tools\cache\top-1m.csv'
$TargetCount = 2000
$CiscoLimit = 500000

$UnsafeDomainPattern = '(adult|casino|gambl|betting|poker|slots|lottery|lotto|bingo|xxx|porn|sex|escort|dating|hookup|onlyfans|chaturbate|xvideos|xnxx|youporn|redtube|brazzers|hentai|erotic|nude|strip|camgirl|webcam|vodka|beer|wine|cannabis|weed)'
$InfrastructureDomainPattern = '(^|[.-])(api|apis|cdn|static|assets|analytics|tagmanager|tracking|telemetry|updates?|windowsupdate|gvt\d?|edgekey|edgesuite|azureedge|cloudfront|akadns|akamai|fastly|sentry|newrelic|datadog|doubleverify|metrics|pixel|beacon|collector|logs?|microsoftonline|sharepoint|ipv4only)([.-]|$)'
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
  'ac.nz', 'co.nz', 'govt.nz', 'net.nz', 'org.nz', 'school.nz',
  'ac.za', 'co.za', 'edu.za', 'gov.za', 'net.za', 'org.za', 'school.za',
  'ac.jp', 'co.jp', 'go.jp', 'ne.jp', 'or.jp',
  'com.br', 'com.cn', 'com.hk', 'com.mx', 'com.sg', 'com.tr',
  'edu.cn', 'edu.hk', 'edu.sg', 'gov.br', 'gov.cn', 'gov.sg', 'net.cn', 'org.cn'
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
  if ($hostName -match '^\d{1,3}(\.\d{1,3}){3}$' -or $hostName -match ':') { return $null }
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

function Test-SafeDomain {
  param([string]$Domain)
  if (-not $Domain -or $Domain -match $UnsafeDomainPattern) { return $false }
  if ($Domain -match $InfrastructureDomainPattern) { return $false }
  $tld = ($Domain.Split('.')[-1]).ToLowerInvariant()
  if ($AdultTlds -contains $tld) { return $false }
  foreach ($blocked in $BlockedDomains) {
    if ($Domain -eq $blocked -or $Domain.EndsWith(".$blocked")) { return $false }
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
  if ($tld -eq 'gov' -or $target -match 'government|parliament|congress|senate|state\.|city\.|county\.') { return 'Government' }
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

if (-not (Test-Path $CsvPath)) {
  throw "Missing $CsvPath. Run tools/build_safe_urls.ps1 once to download Cisco ranking data."
}

$domainMap = [ordered]@{}
$domainMap['jw.org'] = [pscustomobject]@{ domain = 'jw.org'; rank = 0; required = $true }

$count = 0
foreach ($line in [System.IO.File]::ReadLines($CsvPath)) {
  if ($count -ge $CiscoLimit -or $domainMap.Count -ge ($TargetCount + 500)) { break }
  $parts = $line.Split(',', 2)
  if ($parts.Count -ne 2) { continue }
  $rank = 0
  if (-not [int]::TryParse($parts[0], [ref]$rank)) { continue }
  $rootDomain = Get-RegisteredDomain $parts[1]
  if (-not $rootDomain -or -not (Test-SafeDomain $rootDomain) -or $domainMap.Contains($rootDomain)) { continue }
  $domainMap[$rootDomain] = [pscustomobject]@{ domain = $rootDomain; rank = $rank; required = $false }
  $count++
}

$items = $domainMap.Values |
  Sort-Object rank, domain |
  Select-Object -First $TargetCount |
  ForEach-Object {
    [pscustomobject]@{
      url = "https://$($_.domain)/"
      category = Get-Category $_.domain
      domain = $_.domain
      rank = $_.rank
      required = $_.required
    }
  }

$generatedAt = Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'
$txt = [System.Collections.Generic.List[string]]::new()
$txt.Add('# Safe Internet App URL list')
$txt.Add("# Generated: $generatedAt")
$txt.Add('# Format: Homepage URL | Category')
$txt.Add('# Criteria: one homepage per registered domain; ranked from cached Cisco Umbrella popularity data; excludes adult/gambling/social/ad-network domain patterns. Live verification progress is stored in verified-homepages.jsonl when tools/build_safe_urls.ps1 is run.')
$txt.Add('# Source: Cisco Umbrella http://s3-us-west-1.amazonaws.com/umbrella-static/top-1m.csv.zip')
$txt.Add('')
foreach ($item in $items) {
  $txt.Add(('{0} | {1}' -f $item.url, $item.category))
}
[System.IO.File]::WriteAllLines((Join-Path $ProjectRoot 'urls.txt'), $txt, [System.Text.UTF8Encoding]::new($false))

$jsPayload = $items | Select-Object url, category
$js = "// Generated by tools/build_ranked_homepage_list.ps1. Keep urls.txt in sync if editing by hand.`nwindow.SAFE_URLS = $($jsPayload | ConvertTo-Json -Depth 4);`n"
[System.IO.File]::WriteAllText((Join-Path $ProjectRoot 'urls.js'), $js, [System.Text.UTF8Encoding]::new($false))

$verifiedRows = if (Test-Path (Join-Path $ProjectRoot 'verified-homepages.jsonl')) {
  (Get-Content (Join-Path $ProjectRoot 'verified-homepages.jsonl') | Measure-Object -Line).Lines
} else { 0 }

$report = [ordered]@{
  generatedAt = $generatedAt
  count = $items.Count
  distinctDomains = ($items.domain | Sort-Object -Unique).Count
  homepageOnly = $true
  duplicateDomains = (($items.domain | Group-Object | Where-Object Count -gt 1) | Measure-Object).Count
  rankingSource = 'Cisco Umbrella cached top-1m.csv'
  liveVerifiedRowsAvailable = $verifiedRows
  requiredDomains = @(@{ domain = 'jw.org'; category = 'Learning'; included = [bool]($items.domain -contains 'jw.org') })
  categories = [ordered]@{}
  note = 'This generated list is homepage-only and domain-safety filtered. Full live HTTP verification can be continued with tools/build_safe_urls.ps1; the current environment timed out before 2000 live checks completed.'
}
foreach ($item in $items) {
  if (-not $report.categories.Contains($item.category)) { $report.categories[$item.category] = 0 }
  $report.categories[$item.category]++
}
$report | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $ProjectRoot 'url-check-report.json') -Encoding utf8NoBOM
Write-Host "Wrote $($items.Count) homepage-only unique domains."
