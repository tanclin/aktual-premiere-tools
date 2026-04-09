#NoEnv
SendMode Input
SetWorkingDir %A_ScriptDir%

; Format datuma DDMMYYYY
FormatTime, currentDate,, ddMMyyyy

; Ime output datoteke
outputFile := A_ScriptDir . "\File List_" . currentDate . ".txt"

; Pobriši star file, če obstaja
FileDelete, %outputFile%

; Loop skozi vse datoteke in podmape
Loop, Files, %A_ScriptDir%\*.*, R
{
    FileAppend, %A_LoopFileFullPath%`n, %outputFile%
}

MsgBox, Seznam ustvarjen:`n%outputFile%