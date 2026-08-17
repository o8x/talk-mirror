; Talk-mirror Windows installer (NSIS)
; Registers the binary as a Windows service (sc.exe) and starts it.

!ifndef VERSION
  !define VERSION "0.1.0"
!endif
!ifndef ARCH
  !define ARCH "amd64"
!endif

!define APPNAME "Talk-mirror"
!define SERVICENAME "TalkMirror"

Name "${APPNAME}"
Caption "${APPNAME} Setup"
OutFile "talk-mirror-v${VERSION}_windows-${ARCH}.exe"
InstallDir "$PROGRAMFILES64\Talk-mirror"
InstallDirRegKey HKLM "Software\Talk-mirror" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "Install"
  SetOutPath "$INSTDIR"
  File "talk-mirror.exe"
  File "talk-mirror-gen-certs.sh"

  ; Data directory under %ProgramData% (machine-wide).
  ReadEnvStr $1 "ProgramData"
  StrCpy $1 "$1\Talk-mirror"
  CreateDirectory "$1"

  ; Stop and remove any previous service registration.
  nsExec::ExecToLog 'sc stop "${SERVICENAME}"'
  nsExec::ExecToLog 'sc delete "${SERVICENAME}"'

  ; Register and start the service.
  nsExec::ExecToLog 'sc create "${SERVICENAME}" binPath= "$INSTDIR\talk-mirror.exe" -d "$1" start= auto DisplayName= "Talk-mirror remote debugger"'
  nsExec::ExecToLog 'sc start "${SERVICENAME}"'

  WriteRegStr HKLM "Software\Talk-mirror" "InstallDir" "$INSTDIR"
  WriteUninstaller "$INSTDIR\uninstall.exe"
SectionEnd

Section "Uninstall"
  nsExec::ExecToLog 'sc stop "${SERVICENAME}"'
  nsExec::ExecToLog 'sc delete "${SERVICENAME}"'

  Delete "$INSTDIR\talk-mirror.exe"
  Delete "$INSTDIR\talk-mirror-gen-certs.sh"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
  DeleteRegKey HKLM "Software\Talk-mirror"

  ; Note: %ProgramData%\Talk-mirror (user data) is left in place intentionally.
SectionEnd
