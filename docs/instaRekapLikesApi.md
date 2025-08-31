# Insta Rekap Likes API

The `getInstaRekapLikes` endpoint returns Instagram like summaries for a client.

## Response

```
{
  "success": true,
  "data": [ /* user like rows */ ],
  "chartHeight": 300,
  "totalPosts": 4,
  "sudahUsers": ["alice"],
  "kurangUsers": ["bob"],
  "belumUsers": ["charlie"],
  "sudahUsersCount": 1,
  "kurangUsersCount": 1,
  "belumUsersCount": 1,
  "noUsernameUsersCount": 1,
  "usersCount": 4
}
```

- **sudahUsers** – usernames that liked at least 50% of posts or are marked as exception.
- **kurangUsers** – usernames that liked some posts but less than 50%.
- **belumUsers** – usernames that did not like any posts.
- **noUsernameUsersCount** – number of users without an Instagram username.
- **usersCount** – total number of users returned in `data`.

### Directorate Clients

When `client_id` refers to a directorate client, the endpoint aggregates user data
across **all** client IDs that have a user role matching the directorate name.
For example, requesting rekap likes for `ditbinmas` will include users from every
client who has the role `ditbinmas`.

### Organization Clients with Non-Operator Roles

When requesting data for a regular organization and the authenticated user role is
not `operator`, only users having the same role as the requester are included in
the response.
