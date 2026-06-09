; RigMatch dual-app installer — component selection + Chat shortcuts

!macro customHeader
  !include nsDialogs.nsh
  !include LogicLib.nsh

  Var InstallRigMatch
  Var InstallChat
  Var HwndCheckRigMatch
  Var HwndCheckChat

  Page custom rm_AppSelectShow rm_AppSelectLeave

  Function rm_AppSelectShow
    ; Default both checked
    StrCpy $InstallRigMatch 1
    StrCpy $InstallChat 1

    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 28u "Choose which apps to install:"
    Pop $0

    ${NSD_CreateCheckbox} 8u 34u 100% 14u "RigMatch.AI  —  benchmark and rank AI models on your hardware"
    Pop $HwndCheckRigMatch
    ${NSD_Check} $HwndCheckRigMatch

    ${NSD_CreateCheckbox} 8u 54u 100% 14u "RigMatch Chat  —  chat with your top-ranked models"
    Pop $HwndCheckChat
    ${NSD_Check} $HwndCheckChat

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
!macroend

!macro customInstall
  ; --- RigMatch Chat shortcuts ---
  ${If} $InstallChat == ${BST_CHECKED}
    CreateShortCut "$DESKTOP\RigMatch Chat.lnk" "$INSTDIR\companions\rigmatch-chat.exe"
    CreateShortCut "$SMPROGRAMS\RigMatch.AI\RigMatch Chat.lnk" "$INSTDIR\companions\rigmatch-chat.exe"
  ${EndIf}

  ; --- If user deselected RigMatch.AI, remove its shortcuts ---
  ${If} $InstallRigMatch <> ${BST_CHECKED}
    Delete "$DESKTOP\RigMatch.AI.lnk"
    Delete "$SMPROGRAMS\RigMatch.AI\RigMatch.AI.lnk"
  ${EndIf}
!macroend

!macro customUnInstall
  Delete "$DESKTOP\RigMatch Chat.lnk"
  Delete "$SMPROGRAMS\RigMatch.AI\RigMatch Chat.lnk"
!macroend
