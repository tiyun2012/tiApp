# In PowerShell inside tiApp folder:
Remove-Item package.json -ErrorAction SilentlyContinue

$json = @'
{
  "name": "ti3d-app",
  "version": "1.0.0",
  "description": "Ti3D Modular Editor",
  "type": "module",
  "scripts": {
    "start": "http-server . -p 8080 -c-1 --cors"
  },
  "dependencies": {
    "three": "^0.170.0"
  },
  "devDependencies": {
    "http-server": "^14.1.1"
  }
}
'@

# IMPORTANT: -Encoding UTF8 fixes the error
Set-Content -Path "package.json" -Value $json -Encoding UTF8

Write-Host "✅ package.json created successfully!" -ForegroundColor Green