<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Keep channel categories as server-owned rows and channel membership as a nullable category reference; this preserves uncategorized channels and lets deleting a category retain its channels.
- Derive the DM sidebar from message participants and their profiles; conversations remain available after a refresh without adding a duplicate conversation store.
- Subscribe to voice roster presence separately from the call view; participants remain visible beneath voice channels even when another channel is selected.
