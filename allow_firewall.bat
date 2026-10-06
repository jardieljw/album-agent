@echo off
:: Check Administrator Privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator privileges to allow local network/mobile access...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

chcp 65001 > nul
cls
echo ===================================================================
echo   ALLOWING MOBILE / LOCAL NETWORK ACCESS IN WINDOWS FIREWALL
echo ===================================================================
echo.

echo [1/3] Removing old or invalid firewall rules...
netsh advfirewall firewall delete rule name="ImageX Servidor 8000 (Entrada)" >nul 2>&1
netsh advfirewall firewall delete rule name="SERVIDOR 8000" >nul 2>&1

echo [2/3] Adding INBOUND rule for port 8000 TCP (Profiles: Public, Private, Domain)...
netsh advfirewall firewall add rule name="ImageX Servidor 8000 (Entrada)" dir=in action=allow protocol=TCP localport=8000 profile=any

echo [3/3] Setting Wi-Fi network category to Private (allows local device communication)...
powershell -Command "Get-NetConnectionProfile | Where-Object {$_.IPv4Connectivity -eq 'Internet'} | Set-NetConnectionProfile -NetworkCategory Private" >nul 2>&1

echo.
echo ===================================================================
echo   SUCCESS! Port 8000 is open in Windows Firewall!
echo ===================================================================
echo.
echo On your mobile device (connected to the same Wi-Fi), open the browser and access:
echo.
echo   http://192.168.50.115:8000
echo.
echo Troubleshooting tips if page does not load:
echo   - Check Wi-Fi settings on mobile device
echo   - Temporarily disable 'Limit IP Address Tracking' on iOS if enabled
echo   - Turn off VPN or iCloud Private Relay if enabled
echo ===================================================================
echo.
pause
