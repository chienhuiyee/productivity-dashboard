import { graphql } from "@octokit/graphql";

export type GithubGraphql = ReturnType<typeof graphql.defaults>;

/** A GraphQL client bound to the user's OAuth token. */
export function githubClient(token: string): GithubGraphql {
  return graphql.defaults({
    headers: { authorization: `token ${token}` },
  });
}
