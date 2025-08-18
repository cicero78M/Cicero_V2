# Insta Rekap Likes API

The `getInstaRekapLikes` endpoint returns Instagram like summaries for a client.

## Response

```
{
  "success": true,
  "data": [ /* user like rows */ ],
  "chartHeight": 300,
  "usersWithLikes": ["alice", "charlie"],
  "usersWithoutLikes": ["bob"],
  "usersWithLikesCount": 2,
  "usersWithoutLikesCount": 1
}
```

- **usersWithLikes** – usernames with `jumlah_like > 0`.
- **usersWithoutLikes** – usernames with `jumlah_like = 0`.
- Count fields provide totals for each category.

### Directorate Clients

When `client_id` refers to a directorate client, the endpoint aggregates user data
across **all** client IDs that have a user role matching the directorate name.
For example, requesting rekap likes for `ditbinmas` will include users from every
client who has the role `ditbinmas`.

### Organization Clients with Non-Operator Roles

When requesting data for a regular organization and the authenticated user role is
not `operator`, only users having the same role as the requester are included in
the response.
