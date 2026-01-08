#!/usr/bin/env ts-node
/**
 * ChittyCan™ Notion ↔ GitHub Projects Sync
 *
 * Bidirectional sync between:
 * - Notion: ChittyCan™ Project Continuity Tracker (Projects)
 * - Notion: ChittyCan™ Project Actions (Actions)
 * - GitHub: Projects and Issues
 *
 * Features:
 * - Two-way sync with conflict detection
 * - Sync state tracking with Last Sync timestamps
 * - DRY_RUN mode for safe testing
 * - Auto-create GitHub Projects from Notion
 * - Safe status mapping between platforms
 */

import { Client } from '@notionhq/client';
import { graphql } from '@octokit/graphql';
import { config } from 'dotenv';
import { z } from 'zod';

// Load environment variables
config();

// ============================================================================
// Configuration & Validation
// ============================================================================

const EnvSchema = z.object({
  NOTION_TOKEN: z.string().min(1, 'NOTION_TOKEN is required'),
  NOTION_PROJECTS_DS: z.string().url('NOTION_PROJECTS_DS must be a valid URL'),
  NOTION_ACTIONS_DS: z.string().url('NOTION_ACTIONS_DS must be a valid URL'),
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN is required'),
  GITHUB_ORG: z.string().min(1, 'GITHUB_ORG is required'),
  DRY_RUN: z.enum(['true', 'false']).default('true'),
});

type Env = z.infer<typeof EnvSchema>;

function validateEnv(): Env {
  try {
    return EnvSchema.parse({
      NOTION_TOKEN: process.env.NOTION_TOKEN,
      NOTION_PROJECTS_DS: process.env.NOTION_PROJECTS_DS,
      NOTION_ACTIONS_DS: process.env.NOTION_ACTIONS_DS,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      GITHUB_ORG: process.env.GITHUB_ORG,
      DRY_RUN: process.env.DRY_RUN || 'true',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
}

// ============================================================================
// Type Definitions
// ============================================================================

interface NotionProject {
  id: string;
  name: string;
  status: string;
  description?: string;
  githubProjectId?: string;
  githubProjectUrl?: string;
  lastSyncAt?: string;
  updatedAt: string;
}

interface NotionAction {
  id: string;
  title: string;
  status: string;
  projectId?: string;
  githubIssueId?: string;
  githubIssueNumber?: number;
  githubIssueUrl?: string;
  description?: string;
  lastSyncAt?: string;
  updatedAt: string;
}

interface GitHubProject {
  id: string;
  number: number;
  title: string;
  url: string;
  shortDescription?: string;
  updatedAt: string;
}

interface GitHubIssue {
  id: string;
  number: number;
  title: string;
  body?: string;
  state: 'OPEN' | 'CLOSED';
  url: string;
  updatedAt: string;
  projectItems?: Array<{ projectId: string }>;
}

interface SyncState {
  direction: 'notion-to-github' | 'github-to-notion' | 'conflict';
  reason: string;
}

// ============================================================================
// Status Mapping
// ============================================================================

const NOTION_TO_GITHUB_STATUS: Record<string, 'OPEN' | 'CLOSED'> = {
  'Not Started': 'OPEN',
  'In Progress': 'OPEN',
  'Blocked': 'OPEN',
  'On Hold': 'OPEN',
  'Completed': 'CLOSED',
  'Cancelled': 'CLOSED',
};

const GITHUB_TO_NOTION_STATUS: Record<string, string> = {
  'OPEN': 'In Progress',
  'CLOSED': 'Completed',
};

// ============================================================================
// Clients
// ============================================================================

class NotionClient {
  private client: Client;
  private projectsDbId: string;
  private actionsDbId: string;

  constructor(token: string, projectsUrl: string, actionsUrl: string) {
    this.client = new Client({ auth: token });
    this.projectsDbId = this.extractDatabaseId(projectsUrl);
    this.actionsDbId = this.extractDatabaseId(actionsUrl);
  }

  private extractDatabaseId(url: string): string {
    // Extract database ID from Notion URL
    // Format: https://www.notion.so/.../ds/ID?db=...
    const match = url.match(/ds\/([a-f0-9]+)/i);
    if (!match) {
      throw new Error(`Could not extract database ID from URL: ${url}`);
    }
    return match[1].replace(/(\w{8})(\w{4})(\w{4})(\w{4})(\w{12})/, '$1-$2-$3-$4-$5');
  }

  async getProjects(): Promise<NotionProject[]> {
    const response = await this.client.databases.query({
      database_id: this.projectsDbId,
    });

    return response.results.map((page: any) => ({
      id: page.id,
      name: this.getPropertyValue(page.properties, 'Name', 'title'),
      status: this.getPropertyValue(page.properties, 'Status', 'select') || 'Not Started',
      description: this.getPropertyValue(page.properties, 'Description', 'rich_text'),
      githubProjectId: this.getPropertyValue(page.properties, 'GitHub Project ID', 'rich_text'),
      githubProjectUrl: this.getPropertyValue(page.properties, 'GitHub Project URL', 'url'),
      lastSyncAt: this.getPropertyValue(page.properties, 'Last Sync', 'date'),
      updatedAt: page.last_edited_time,
    }));
  }

  async getActions(projectId?: string): Promise<NotionAction[]> {
    const filter = projectId ? {
      property: 'Project',
      relation: { contains: projectId },
    } : undefined;

    const response = await this.client.databases.query({
      database_id: this.actionsDbId,
      filter,
    });

    return response.results.map((page: any) => ({
      id: page.id,
      title: this.getPropertyValue(page.properties, 'Name', 'title'),
      status: this.getPropertyValue(page.properties, 'Status', 'select') || 'Not Started',
      projectId: this.getPropertyValue(page.properties, 'Project', 'relation')?.[0],
      description: this.getPropertyValue(page.properties, 'Description', 'rich_text'),
      githubIssueId: this.getPropertyValue(page.properties, 'GitHub Issue ID', 'rich_text'),
      githubIssueNumber: parseInt(this.getPropertyValue(page.properties, 'GitHub Issue #', 'number') || '0'),
      githubIssueUrl: this.getPropertyValue(page.properties, 'GitHub Issue URL', 'url'),
      lastSyncAt: this.getPropertyValue(page.properties, 'Last Sync', 'date'),
      updatedAt: page.last_edited_time,
    }));
  }

  async updateProject(pageId: string, updates: Partial<NotionProject>, dryRun: boolean): Promise<void> {
    if (dryRun) {
      console.log(`[DRY RUN] Would update Notion project ${pageId}:`, updates);
      return;
    }

    const properties: any = {};

    if (updates.githubProjectId) {
      properties['GitHub Project ID'] = { rich_text: [{ text: { content: updates.githubProjectId } }] };
    }
    if (updates.githubProjectUrl) {
      properties['GitHub Project URL'] = { url: updates.githubProjectUrl };
    }
    if (updates.status) {
      properties['Status'] = { select: { name: updates.status } };
    }

    // Always update Last Sync timestamp
    properties['Last Sync'] = { date: { start: new Date().toISOString() } };

    await this.client.pages.update({
      page_id: pageId,
      properties,
    });
  }

  async updateAction(pageId: string, updates: Partial<NotionAction>, dryRun: boolean): Promise<void> {
    if (dryRun) {
      console.log(`[DRY RUN] Would update Notion action ${pageId}:`, updates);
      return;
    }

    const properties: any = {};

    if (updates.githubIssueId) {
      properties['GitHub Issue ID'] = { rich_text: [{ text: { content: updates.githubIssueId } }] };
    }
    if (updates.githubIssueNumber) {
      properties['GitHub Issue #'] = { number: updates.githubIssueNumber };
    }
    if (updates.githubIssueUrl) {
      properties['GitHub Issue URL'] = { url: updates.githubIssueUrl };
    }
    if (updates.status) {
      properties['Status'] = { select: { name: updates.status } };
    }

    // Always update Last Sync timestamp
    properties['Last Sync'] = { date: { start: new Date().toISOString() } };

    await this.client.pages.update({
      page_id: pageId,
      properties,
    });
  }

  private getPropertyValue(properties: any, name: string, type: string): any {
    const prop = properties[name];
    if (!prop) return null;

    switch (type) {
      case 'title':
        return prop.title?.[0]?.plain_text || '';
      case 'rich_text':
        return prop.rich_text?.[0]?.plain_text || '';
      case 'select':
        return prop.select?.name || null;
      case 'number':
        return prop.number || null;
      case 'url':
        return prop.url || null;
      case 'date':
        return prop.date?.start || null;
      case 'relation':
        return prop.relation?.map((r: any) => r.id) || [];
      default:
        return null;
    }
  }
}

class GitHubClient {
  private graphqlWithAuth: typeof graphql;
  private org: string;

  constructor(token: string, org: string) {
    this.graphqlWithAuth = graphql.defaults({
      headers: { authorization: `token ${token}` },
    });
    this.org = org;
  }

  async getOrCreateProject(title: string, description?: string, dryRun = false): Promise<GitHubProject> {
    // Try to find existing project first
    const existingProjects = await this.listProjects();
    const existing = existingProjects.find(p => p.title === title);

    if (existing) {
      console.log(`✓ Found existing GitHub project: ${title}`);
      return existing;
    }

    if (dryRun) {
      console.log(`[DRY RUN] Would create GitHub project: ${title}`);
      return {
        id: 'dry-run-id',
        number: 0,
        title,
        url: 'https://github.com/dry-run',
        shortDescription: description,
        updatedAt: new Date().toISOString(),
      };
    }

    // Get organization ID
    const orgData: any = await this.graphqlWithAuth(`
      query($org: String!) {
        organization(login: $org) {
          id
        }
      }
    `, { org: this.org });

    // Create new project
    const result: any = await this.graphqlWithAuth(`
      mutation($ownerId: ID!, $title: String!, $body: String) {
        createProjectV2(input: {
          ownerId: $ownerId
          title: $title
          shortDescription: $body
        }) {
          projectV2 {
            id
            number
            title
            url
            shortDescription
            updatedAt
          }
        }
      }
    `, {
      ownerId: orgData.organization.id,
      title,
      body: description,
    });

    console.log(`✓ Created GitHub project: ${title}`);
    return result.createProjectV2.projectV2;
  }

  async listProjects(): Promise<GitHubProject[]> {
    const result: any = await this.graphqlWithAuth(`
      query($org: String!) {
        organization(login: $org) {
          projectsV2(first: 100) {
            nodes {
              id
              number
              title
              url
              shortDescription
              updatedAt
            }
          }
        }
      }
    `, { org: this.org });

    return result.organization.projectsV2.nodes;
  }

  async createIssue(
    repo: string,
    title: string,
    body?: string,
    projectId?: string,
    dryRun = false
  ): Promise<GitHubIssue> {
    if (dryRun) {
      console.log(`[DRY RUN] Would create GitHub issue in ${repo}: ${title}`);
      return {
        id: 'dry-run-issue-id',
        number: 0,
        title,
        body,
        state: 'OPEN',
        url: 'https://github.com/dry-run',
        updatedAt: new Date().toISOString(),
      };
    }

    // Get repository ID
    const repoData: any = await this.graphqlWithAuth(`
      query($org: String!, $repo: String!) {
        repository(owner: $org, name: $repo) {
          id
        }
      }
    `, { org: this.org, repo });

    // Create issue
    const result: any = await this.graphqlWithAuth(`
      mutation($repoId: ID!, $title: String!, $body: String) {
        createIssue(input: {
          repositoryId: $repoId
          title: $title
          body: $body
        }) {
          issue {
            id
            number
            title
            body
            state
            url
            updatedAt
          }
        }
      }
    `, {
      repoId: repoData.repository.id,
      title,
      body,
    });

    const issue = result.createIssue.issue;

    // Add to project if projectId provided
    if (projectId) {
      await this.addIssueToProject(issue.id, projectId, dryRun);
    }

    console.log(`✓ Created GitHub issue #${issue.number}: ${title}`);
    return issue;
  }

  async updateIssue(
    issueId: string,
    updates: { title?: string; body?: string; state?: 'OPEN' | 'CLOSED' },
    dryRun = false
  ): Promise<void> {
    if (dryRun) {
      console.log(`[DRY RUN] Would update GitHub issue ${issueId}:`, updates);
      return;
    }

    if (updates.state === 'CLOSED') {
      await this.graphqlWithAuth(`
        mutation($issueId: ID!) {
          closeIssue(input: { issueId: $issueId }) {
            issue { id }
          }
        }
      `, { issueId });
    } else if (updates.state === 'OPEN') {
      await this.graphqlWithAuth(`
        mutation($issueId: ID!) {
          reopenIssue(input: { issueId: $issueId }) {
            issue { id }
          }
        }
      `, { issueId });
    }

    if (updates.title || updates.body) {
      await this.graphqlWithAuth(`
        mutation($issueId: ID!, $title: String, $body: String) {
          updateIssue(input: {
            id: $issueId
            title: $title
            body: $body
          }) {
            issue { id }
          }
        }
      `, { issueId, title: updates.title, body: updates.body });
    }
  }

  async addIssueToProject(issueId: string, projectId: string, dryRun = false): Promise<void> {
    if (dryRun) {
      console.log(`[DRY RUN] Would add issue ${issueId} to project ${projectId}`);
      return;
    }

    await this.graphqlWithAuth(`
      mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: {
          projectId: $projectId
          contentId: $contentId
        }) {
          item { id }
        }
      }
    `, { projectId, contentId: issueId });
  }

  async getIssuesByProject(projectId: string): Promise<GitHubIssue[]> {
    const result: any = await this.graphqlWithAuth(`
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            items(first: 100) {
              nodes {
                content {
                  ... on Issue {
                    id
                    number
                    title
                    body
                    state
                    url
                    updatedAt
                  }
                }
              }
            }
          }
        }
      }
    `, { projectId });

    return result.node.items.nodes
      .map((item: any) => item.content)
      .filter(Boolean);
  }
}

// ============================================================================
// Sync Logic
// ============================================================================

class SyncEngine {
  constructor(
    private notion: NotionClient,
    private github: GitHubClient,
    private dryRun: boolean
  ) {}

  private determineSyncDirection(
    notionUpdatedAt: string,
    githubUpdatedAt: string,
    lastSyncAt?: string
  ): SyncState {
    const notionTime = new Date(notionUpdatedAt).getTime();
    const githubTime = new Date(githubUpdatedAt).getTime();
    const lastSync = lastSyncAt ? new Date(lastSyncAt).getTime() : 0;

    const notionChangedSinceSync = notionTime > lastSync;
    const githubChangedSinceSync = githubTime > lastSync;

    if (notionChangedSinceSync && githubChangedSinceSync) {
      return {
        direction: 'conflict',
        reason: `Both updated since last sync (Notion: ${new Date(notionTime).toISOString()}, GitHub: ${new Date(githubTime).toISOString()})`,
      };
    }

    if (notionChangedSinceSync) {
      return {
        direction: 'notion-to-github',
        reason: `Notion updated at ${new Date(notionTime).toISOString()}`,
      };
    }

    if (githubChangedSinceSync) {
      return {
        direction: 'github-to-notion',
        reason: `GitHub updated at ${new Date(githubTime).toISOString()}`,
      };
    }

    return {
      direction: 'notion-to-github',
      reason: 'No changes detected, defaulting to Notion',
    };
  }

  async syncProjects(repo: string): Promise<void> {
    console.log('\n📊 Syncing Projects...\n');

    const notionProjects = await this.notion.getProjects();
    console.log(`Found ${notionProjects.length} Notion projects`);

    for (const project of notionProjects) {
      console.log(`\n→ Processing: ${project.name}`);

      try {
        // Get or create GitHub project
        let githubProject: GitHubProject;

        if (project.githubProjectId) {
          // Already linked, check for updates
          const allProjects = await this.github.listProjects();
          githubProject = allProjects.find(p => p.id === project.githubProjectId)!;

          if (!githubProject) {
            console.log(`  ⚠️  Linked GitHub project not found, creating new one`);
            githubProject = await this.github.getOrCreateProject(
              project.name,
              project.description,
              this.dryRun
            );
          } else {
            // Determine sync direction
            const syncState = this.determineSyncDirection(
              project.updatedAt,
              githubProject.updatedAt,
              project.lastSyncAt
            );

            console.log(`  ℹ️  Sync: ${syncState.direction} (${syncState.reason})`);

            if (syncState.direction === 'conflict') {
              console.log(`  ⚠️  CONFLICT: Manual resolution required`);
              continue;
            }

            // For now, projects don't have much to sync besides linking
            // In the future, you could sync description, status, etc.
          }
        } else {
          // Not linked yet, create GitHub project
          githubProject = await this.github.getOrCreateProject(
            project.name,
            project.description,
            this.dryRun
          );
        }

        // Update Notion with GitHub project info
        await this.notion.updateProject(
          project.id,
          {
            githubProjectId: githubProject.id,
            githubProjectUrl: githubProject.url,
          },
          this.dryRun
        );

        console.log(`  ✓ Synced with GitHub Project #${githubProject.number}`);

        // Sync actions for this project
        await this.syncActions(project, githubProject, repo);

      } catch (error) {
        console.error(`  ✗ Error syncing project: ${error}`);
      }
    }
  }

  async syncActions(
    notionProject: NotionProject,
    githubProject: GitHubProject,
    repo: string
  ): Promise<void> {
    console.log(`\n  📝 Syncing Actions for ${notionProject.name}...`);

    const notionActions = await this.notion.getActions(notionProject.id);
    const githubIssues = await this.github.getIssuesByProject(githubProject.id);

    console.log(`  Found ${notionActions.length} Notion actions, ${githubIssues.length} GitHub issues`);

    // Sync Notion actions to GitHub issues
    for (const action of notionActions) {
      try {
        if (action.githubIssueId) {
          // Already linked, check for sync
          const githubIssue = githubIssues.find(i => i.id === action.githubIssueId);

          if (!githubIssue) {
            console.log(`    ⚠️  Linked GitHub issue not found for: ${action.title}`);
            continue;
          }

          const syncState = this.determineSyncDirection(
            action.updatedAt,
            githubIssue.updatedAt,
            action.lastSyncAt
          );

          console.log(`    → ${action.title}: ${syncState.direction}`);

          if (syncState.direction === 'conflict') {
            console.log(`      ⚠️  CONFLICT: Manual resolution required`);
            continue;
          }

          if (syncState.direction === 'notion-to-github') {
            // Update GitHub issue
            const githubState = NOTION_TO_GITHUB_STATUS[action.status] || 'OPEN';
            await this.github.updateIssue(
              githubIssue.id,
              {
                title: action.title,
                body: action.description,
                state: githubState,
              },
              this.dryRun
            );

            await this.notion.updateAction(action.id, {}, this.dryRun);
            console.log(`      ✓ Updated GitHub issue #${githubIssue.number}`);
          } else {
            // Update Notion action
            const notionStatus = GITHUB_TO_NOTION_STATUS[githubIssue.state] || action.status;
            await this.notion.updateAction(
              action.id,
              { status: notionStatus },
              this.dryRun
            );
            console.log(`      ✓ Updated Notion action from GitHub`);
          }

        } else {
          // Create new GitHub issue
          const githubState = NOTION_TO_GITHUB_STATUS[action.status] || 'OPEN';
          const githubIssue = await this.github.createIssue(
            repo,
            action.title,
            action.description,
            githubProject.id,
            this.dryRun
          );

          await this.notion.updateAction(
            action.id,
            {
              githubIssueId: githubIssue.id,
              githubIssueNumber: githubIssue.number,
              githubIssueUrl: githubIssue.url,
            },
            this.dryRun
          );

          console.log(`    ✓ Created & linked GitHub issue #${githubIssue.number}: ${action.title}`);
        }
      } catch (error) {
        console.error(`    ✗ Error syncing action ${action.title}: ${error}`);
      }
    }

    // Find unlinked GitHub issues and link them to Notion
    // (This would create new Notion actions - implement if needed)
  }

  async run(repo: string): Promise<void> {
    console.log('🔄 ChittyCan™ Notion ↔ GitHub Sync');
    console.log('====================================');
    console.log(`Mode: ${this.dryRun ? '🔍 DRY RUN' : '🚀 LIVE'}`);
    console.log(`Repository: ${repo}\n`);

    try {
      await this.syncProjects(repo);

      console.log('\n✅ Sync completed successfully!');

      if (this.dryRun) {
        console.log('\n💡 Run with DRY_RUN=false to apply changes');
      }
    } catch (error) {
      console.error('\n❌ Sync failed:', error);
      throw error;
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  // Validate environment
  const env = validateEnv();
  const dryRun = env.DRY_RUN === 'true';

  // Get repository name from args or default to a common one
  const repo = process.argv[2] || 'chittyreception';

  // Initialize clients
  const notion = new NotionClient(
    env.NOTION_TOKEN,
    env.NOTION_PROJECTS_DS,
    env.NOTION_ACTIONS_DS
  );

  const github = new GitHubClient(
    env.GITHUB_TOKEN,
    env.GITHUB_ORG
  );

  // Run sync
  const sync = new SyncEngine(notion, github, dryRun);
  await sync.run(repo);
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { SyncEngine, NotionClient, GitHubClient };
