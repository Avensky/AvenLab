# Assisted text

keyboardStore owns one temporary text session and the Auto/On/Off preference.
Only the explicit preference persists. Auto uses trusted physical typing as
session evidence; pointer type is not evidence of an attached keyboard.
AssistedInput opens a session and OnScreenKeyboard renders/controller-routes it.
Cancel restores the initial field; Done returns focus. Driving input is released
while a text session owns routing. Secrets never enter persisted preferences.
