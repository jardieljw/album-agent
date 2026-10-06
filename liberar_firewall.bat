@echo off
:: Verifica se tem permissão de Administrador
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Solicitando permissao de Administrador para liberar acesso do iPhone...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

chcp 65001 > nul
cls
echo ===================================================================
echo   LIBERANDO ACESSO DO IPHONE E REDE LOCAL NO WINDOWS FIREWALL
echo ===================================================================
echo.

echo [1/3] Removendo regras antigas ou invalidas...
netsh advfirewall firewall delete rule name="ImageX Servidor 8000 (Entrada)" >nul 2>&1
netsh advfirewall firewall delete rule name="SERVIDOR 8000" >nul 2>&1

echo [2/3] Criando regra de ENTRADA para a porta 8000 TCP (Todos os Perfis: Publico, Particular, Dominio)...
netsh advfirewall firewall add rule name="ImageX Servidor 8000 (Entrada)" dir=in action=allow protocol=TCP localport=8000 profile=any

echo [3/3] Configurando a rede Wi-Fi para Particular (permite comunicacao local com o iPhone)...
powershell -Command "Get-NetConnectionProfile | Where-Object {$_.IPv4Connectivity -eq 'Internet'} | Set-NetConnectionProfile -NetworkCategory Private" >nul 2>&1

echo.
echo ===================================================================
echo   SUCESSO! Porta 8000 liberada com sucesso!
echo ===================================================================
echo.
echo No seu iPhone (conectado no mesmo Wi-Fi), abra o Safari e acesse:
echo.
echo   http://192.168.50.115:8000
echo.
echo Dica no iPhone caso ainda nao carregue:
echo   - Va em Ajustes > Wi-Fi > toque no (i) da rede conectada
echo   - Desative temporariamente "Limitar Rastreamento de Endereco IP"
echo   - Se tiver VPN ou Retransmissao Privada do iCloud ativada, desative.
echo ===================================================================
echo.
pause
