#requires -Version 5.1
$ErrorActionPreference = "Stop"

function Get-FinNovaMySqlClient {
    $Client = Join-Path $env:ProgramFiles "MySQL\MySQL Server 8.4\bin\mysql.exe"
    if (-not (Test-Path -LiteralPath $Client -PathType Leaf)) {
        throw "MySQL 8.4 client missing at the verified installation path. Stop; do not reinstall blindly."
    }
    return $Client
}

function Protect-FinNovaPath {
    param([string]$Path, [switch]$Directory)
    $UserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $SystemSid = [Security.Principal.SecurityIdentifier]::new("S-1-5-18")
    if ($Directory) {
        $Acl = [Security.AccessControl.DirectorySecurity]::new()
        $Inheritance = [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit
        foreach ($Sid in @($UserSid, $SystemSid)) {
            $Rule = [Security.AccessControl.FileSystemAccessRule]::new(
                $Sid, [Security.AccessControl.FileSystemRights]::FullControl,
                $Inheritance, [Security.AccessControl.PropagationFlags]::None,
                [Security.AccessControl.AccessControlType]::Allow)
            [void]$Acl.AddAccessRule($Rule)
        }
    }
    else {
        $Acl = [Security.AccessControl.FileSecurity]::new()
        foreach ($Sid in @($UserSid, $SystemSid)) {
            [void]$Acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
                $Sid, [Security.AccessControl.FileSystemRights]::FullControl,
                [Security.AccessControl.AccessControlType]::Allow))
        }
    }
    $Acl.SetAccessRuleProtection($true, $false)
    $Acl.SetOwner($UserSid)
    Set-Acl -LiteralPath $Path -AclObject $Acl
}

function Write-FinNovaPrivateEnv {
    param([string]$Path, [string[]]$Lines)
    if (Test-Path -LiteralPath $Path) { throw "The environment file already exists. It was not overwritten." }
    # Create and protect an empty new file before writing credentials.
    $Stream = [IO.File]::Open($Path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $Stream.Dispose()
    Protect-FinNovaPath -Path $Path
    [IO.File]::WriteAllText($Path, ($Lines -join "`r`n") + "`r`n", [Text.UTF8Encoding]::new($false))
}

function Invoke-FinNovaRootSql {
    param([string]$Sql)
    $Client = Get-FinNovaMySqlClient
    Write-Host "Enter your local MySQL root password at the client prompt. It is not saved." -ForegroundColor Cyan
    $Previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $OutputLines = @(& $Client --no-defaults --no-login-paths --protocol=TCP --host=127.0.0.1 --port=3306 --user=root --password --ssl-mode=REQUIRED --batch --raw --skip-column-names --execute $Sql)
        $Code = $LASTEXITCODE
    }
    finally { $ErrorActionPreference = $Previous }
    # Caller must capture this object: CREATE USER can return generated passwords.
    return [PSCustomObject]@{ ExitCode = $Code; Lines = $OutputLines }
}

function ConvertTo-FinNovaOptionValue([string]$Value) {
    return '"' + $Value.Replace('\','\\').Replace('"','\"').Replace("`r",'\r').Replace("`n",'\n').Replace("`t",'\t') + '"'
}

function Invoke-FinNovaAppSql {
    param(
        [ValidateSet("finnova_demo", "finnova_test")][string]$Schema,
        [string]$Sql
    )
    if ($env:DB_APP_USERNAME -ne "finnova_app" -or [string]::IsNullOrWhiteSpace($env:DB_APP_PASSWORD)) {
        throw "Load the private environment using Use-FinNovaEnvironment.ps1 first."
    }
    $Client = Get-FinNovaMySqlClient
    $PrivateDirectory = Join-Path $env:TEMP ("FinNovaClient-" + [guid]::NewGuid().ToString("N"))
    if (Test-Path -LiteralPath $PrivateDirectory) { throw "Temporary directory collision. Nothing was changed." }
    New-Item -ItemType Directory -Path $PrivateDirectory | Out-Null
    $Ini = Join-Path $PrivateDirectory "client.cnf"
    try {
        Protect-FinNovaPath -Path $PrivateDirectory -Directory
        if (Test-Path -LiteralPath $Ini) { throw "Temporary client file already exists." }
        $ClientLines = @(
            "[client]"
            "user=finnova_app"
            ("password=" + (ConvertTo-FinNovaOptionValue $env:DB_APP_PASSWORD))
            "host=127.0.0.1"
            "port=3306"
            "protocol=TCP"
            "ssl-mode=REQUIRED"
            "default-character-set=utf8mb4"
        )
        [IO.File]::WriteAllText($Ini, ($ClientLines -join "`r`n") + "`r`n", [Text.UTF8Encoding]::new($false))
        $Previous = $ErrorActionPreference
        try {
            $ErrorActionPreference = "Continue"
            # Read only our private options, not global options or saved login paths.
            # Option-file switches must precede ordinary client options.
            $OutputLines = @(& $Client "--defaults-file=$Ini" --no-login-paths "--database=$Schema" --table --execute $Sql)
            $Code = $LASTEXITCODE
        }
        finally { $ErrorActionPreference = $Previous }
        if ($Code -ne 0) { throw "Database verification failed with exit code $Code. Share the error, not credentials." }
        return $OutputLines
    }
    finally {
        # Only this call's newly created private temporary file/directory are removed.
        if (Test-Path -LiteralPath $Ini -PathType Leaf) { Remove-Item -LiteralPath $Ini }
        if (Test-Path -LiteralPath $PrivateDirectory -PathType Container) { Remove-Item -LiteralPath $PrivateDirectory }
    }
}
Export-ModuleMember -Function Get-FinNovaMySqlClient, Write-FinNovaPrivateEnv, Invoke-FinNovaRootSql, Invoke-FinNovaAppSql
