; RigMatch dual-app installer — component selection + Chat shortcuts
;
; Shortcut cleanup covers BOTH name eras: installs that predate the rename used
; a "RigMatch.AI" Start Menu folder and desktop link. Upgrades and uninstalls
; must clear those too, or renamed installs show the app twice.
;
; Where the "Choose which apps" page goes matters. electron-builder declares its
; own pages (install mode, folder, install, Finish) before it inserts
; customHeader, and NSIS shows pages in the order they are declared, so a page
; declared in customHeader came after Finish: the shortcuts were already decided
; before anyone saw the checkboxes. customPageAfterChangeDir puts it after the
; folder page, before the install runs.
;
; Silent installs (winget, /S) show no pages at all, so customInit starts both
; apps ticked; without it both read as unticked and the install made no RigChat
; shortcuts and deleted the RigMatch desktop shortcut.

!macro customHeader
  ; Only the installer has the page. The uninstaller is built from this file too,
  ; and an unused variable or function there is a warning, which fails the build.
  !ifndef BUILD_UNINSTALLER
    !include nsDialogs.nsh
    !include LogicLib.nsh

    Var InstallRigMatch
    Var InstallChat
    Var HwndCheckRigMatch
    Var HwndCheckChat

    Function rm_AppSelectShow
      nsDialogs::Create 1018
      Pop $0
      ${If} $0 == error
        Abort
      ${EndIf}

      ${NSD_CreateLabel} 0 0 100% 28u "Choose which apps to install:"
      Pop $0

      ; The boxes show the current choice, so Back and Next keep it.
      ${NSD_CreateCheckbox} 8u 34u 100% 14u "RigMatch  —  benchmark and rank AI models on your hardware"
      Pop $HwndCheckRigMatch
      ${NSD_SetState} $HwndCheckRigMatch $InstallRigMatch

      ${NSD_CreateCheckbox} 8u 54u 100% 14u "RigMatch Chat  —  chat with your top-ranked models"
      Pop $HwndCheckChat
      ${NSD_SetState} $HwndCheckChat $InstallChat

      nsDialogs::Show
    FunctionEnd

    Function rm_AppSelectLeave
      ${NSD_GetState} $HwndCheckRigMatch $InstallRigMatch
      ${NSD_GetState} $HwndCheckChat $InstallChat

      ${If} $InstallRigMatch == 0
      ${AndIf} $InstallChat == 0
        MessageBox MB_OK|MB_ICONEXCLAMATION "Please select at least one app to install."
        Abort
      ${EndIf}
    FunctionEnd
  !endif
!macroend

!macro customInit
  ; Both ticked until the page says otherwise; a silent install never shows it.
  StrCpy $InstallRigMatch ${BST_CHECKED}
  StrCpy $InstallChat ${BST_CHECKED}
!macroend

!macro customPageAfterChangeDir
  Page custom rm_AppSelectShow rm_AppSelectLeave
!macroend

!macro customInstall
  ; Updates (auto-update, winget upgrade) pass --updated and show no pages, so
  ; they leave the shortcuts as the person has them, the way electron-builder
  ; keeps its own RigMatch shortcuts on an update.
  ${IfNot} ${isUpdated}
    ; --- RigMatch Chat shortcuts ---
    ${If} $InstallChat == ${BST_CHECKED}
      ${If} ${FileExists} "$INSTDIR\companions\rigmatch-chat.exe"
        CreateDirectory "$SMPROGRAMS\RigMatch"
        Delete "$DESKTOP\RigMatch Chat.lnk"
        Delete "$SMPROGRAMS\RigMatch\RigMatch Chat.lnk"
        CreateShortCut "$DESKTOP\RigChat.lnk" "$INSTDIR\companions\rigmatch-chat.exe" "" "$INSTDIR\companions\rigmatch-chat.exe" 0
        CreateShortCut "$SMPROGRAMS\RigMatch\RigChat.lnk" "$INSTDIR\companions\rigmatch-chat.exe" "" "$INSTDIR\companions\rigmatch-chat.exe" 0
      ${EndIf}
    ${EndIf}

    ; --- If the person unticked RigMatch, remove the shortcuts electron-builder
    ; just made for it (it has no folder: $SMPROGRAMS\RigMatch.lnk) ---
    ${If} $InstallRigMatch <> ${BST_CHECKED}
      Delete "$newDesktopLink"
      Delete "$newStartMenuLink"
    ${EndIf}
  ${EndIf}

  ; --- Old-name leftovers: upgrading from a RigMatch.AI-branded install ---
  Delete "$SMPROGRAMS\RigMatch.AI\RigChat.lnk"
  Delete "$SMPROGRAMS\RigMatch.AI\RigMatch Chat.lnk"
  Delete "$SMPROGRAMS\RigMatch.AI\RigMatch.AI.lnk"
  RMDir "$SMPROGRAMS\RigMatch.AI"
  Delete "$DESKTOP\RigMatch.AI.lnk"
!macroend

!macro customUnInstall
  Delete "$DESKTOP\RigChat.lnk"
  Delete "$SMPROGRAMS\RigMatch\RigChat.lnk"
  Delete "$DESKTOP\RigMatch Chat.lnk"
  Delete "$SMPROGRAMS\RigMatch\RigMatch Chat.lnk"
  RMDir "$SMPROGRAMS\RigMatch"
  ; Old-name leftovers from installs that predate the rename.
  Delete "$SMPROGRAMS\RigMatch.AI\RigChat.lnk"
  Delete "$SMPROGRAMS\RigMatch.AI\RigMatch Chat.lnk"
  RMDir "$SMPROGRAMS\RigMatch.AI"
!macroend
