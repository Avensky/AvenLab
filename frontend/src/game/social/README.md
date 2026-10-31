# Social menus

SocialPanel owns tabs/status and one in-flight command. WorldsPage, PeoplePages
and InvitationsPage render server state and submit named actions through the one
socialClient request owner. No component decides permissions, edits authoritative
memberships or spawns physics. navigation.ts hands a joined map to the existing
garage. invitationLinks.ts only handles public world codes. useFormNavigation owns
controller form focus; the shared text keyboard has routing priority.

See docs/SOCIAL_WORLDS.md for scope, persistence, capacity and installation.
