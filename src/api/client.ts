/**
 * BugHerd API v2 Client
 * @see https://www.bugherd.com/api_v2
 *
 * Authentication: Basic HTTP Auth with API key as user, 'x' as password
 * Rate Limit: 60 requests/minute average, bursts of 10
 */

import type {
  BugherdAttachmentResponse,
  BugherdAttachmentsResponse,
  BugherdColumnResponse,
  BugherdColumnsResponse,
  BugherdCommentsResponse,
  BugherdGuestsResponse,
  BugherdMembersResponse,
  BugherdOrganizationResponse,
  BugherdProjectResponse,
  BugherdProjectsResponse,
  BugherdTaskResponse,
  BugherdTasksResponse,
  BugherdUsersResponse,
  BugherdWebhookEvent,
  BugherdWebhookResponse,
  BugherdWebhooksResponse,
} from "../types/bugherd.js";

const BUGHERD_BASE_URL = "https://www.bugherd.com/api_v2";

/**
 * Get the API key from environment variables
 */
function getApiKey(): string {
  const apiKey = process.env.BUGHERD_API_KEY;
  if (!apiKey) {
    throw new Error(
      "BUGHERD_API_KEY environment variable is required. " +
        "Get your API key from BugHerd Settings > General Settings.",
    );
  }
  return apiKey;
}

/**
 * Make an authenticated request to the BugHerd API
 */
async function bugherdRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const apiKey = getApiKey();
  const auth = Buffer.from(`${apiKey}:x`).toString("base64");

  const url = `${BUGHERD_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("BugHerd API rate limit exceeded. Wait a moment and try again.");
    }
    if (response.status === 401) {
      throw new Error("BugHerd API authentication failed. Check your BUGHERD_API_KEY.");
    }
    if (response.status === 404) {
      throw new Error(`BugHerd resource not found: ${endpoint}`);
    }

    const errorText = await response.text();
    throw new Error(`BugHerd API error (${response.status}): ${errorText}`);
  }

  // Handle 204 No Content (for DELETE operations)
  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

// ============================================================================
// Organization
// ============================================================================

/**
 * Get organization/account details
 */
export async function getOrganization(): Promise<BugherdOrganizationResponse> {
  return bugherdRequest<BugherdOrganizationResponse>("/organization.json");
}

// ============================================================================
// Users
// ============================================================================

/**
 * List all users (members + guests)
 */
export async function listUsers(): Promise<BugherdUsersResponse> {
  return bugherdRequest<BugherdUsersResponse>("/users.json");
}

/**
 * List only team members
 */
export async function listMembers(): Promise<BugherdMembersResponse> {
  return bugherdRequest<BugherdMembersResponse>("/users/members.json");
}

/**
 * List only guests/clients
 */
export async function listGuests(): Promise<BugherdGuestsResponse> {
  return bugherdRequest<BugherdGuestsResponse>("/users/guests.json");
}

export interface ListUserTasksOptions {
  status?: string;
  priority?: "critical" | "important" | "normal" | "minor";
  page?: number;
}

/**
 * Get tasks assigned to a specific user
 */
export async function getUserTasks(
  userId: number,
  options: ListUserTasksOptions = {},
): Promise<BugherdTasksResponse> {
  const params = new URLSearchParams();
  if (options.status) params.set("status", options.status);
  if (options.priority) params.set("priority", options.priority);
  if (options.page) params.set("page", options.page.toString());

  const query = params.toString();
  const endpoint = `/users/${userId}/tasks.json${query ? `?${query}` : ""}`;
  return bugherdRequest<BugherdTasksResponse>(endpoint);
}

/**
 * Get projects for a specific user
 */
export async function getUserProjects(userId: number): Promise<BugherdProjectsResponse> {
  return bugherdRequest<BugherdProjectsResponse>(`/users/${userId}/projects.json`);
}

// ============================================================================
// Projects
// ============================================================================

/**
 * List all projects accessible to the authenticated user
 */
export async function listProjects(): Promise<BugherdProjectsResponse> {
  return bugherdRequest<BugherdProjectsResponse>("/projects.json");
}

/**
 * List only active projects
 */
export async function listActiveProjects(): Promise<BugherdProjectsResponse> {
  return bugherdRequest<BugherdProjectsResponse>("/projects/active.json");
}

/**
 * Get a single project by ID
 */
export async function getProject(projectId: number): Promise<BugherdProjectResponse> {
  return bugherdRequest<BugherdProjectResponse>(`/projects/${projectId}.json`);
}

export interface CreateProjectData {
  name: string;
  devurl: string;
  is_active?: boolean;
  is_public?: boolean;
}

/**
 * Create a new project
 */
export async function createProject(data: CreateProjectData): Promise<BugherdProjectResponse> {
  return bugherdRequest<BugherdProjectResponse>("/projects.json", {
    method: "POST",
    body: JSON.stringify({ project: data }),
  });
}

export interface UpdateProjectData {
  name?: string;
  devurl?: string;
  is_active?: boolean;
  is_public?: boolean;
}

/**
 * Update a project
 */
export async function updateProject(
  projectId: number,
  data: UpdateProjectData,
): Promise<BugherdProjectResponse> {
  return bugherdRequest<BugherdProjectResponse>(`/projects/${projectId}.json`, {
    method: "PUT",
    body: JSON.stringify({ project: data }),
  });
}

/**
 * Delete a project (DESTRUCTIVE)
 */
export async function deleteProject(projectId: number): Promise<void> {
  await bugherdRequest<void>(`/projects/${projectId}.json`, {
    method: "DELETE",
  });
}

/**
 * Add a member to a project
 */
export async function addMember(projectId: number, userId: number): Promise<void> {
  await bugherdRequest<void>(`/projects/${projectId}/add_member.json`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });
}

/**
 * Add a guest/client to a project
 */
export async function addGuest(projectId: number, userIdOrEmail: number | string): Promise<void> {
  const body =
    typeof userIdOrEmail === "number" ? { user_id: userIdOrEmail } : { email: userIdOrEmail };
  await bugherdRequest<void>(`/projects/${projectId}/add_guest.json`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ============================================================================
// Tasks
// ============================================================================

export interface ListTasksOptions {
  status?: string; // Can be standard or custom column name
  priority?: "critical" | "important" | "normal" | "minor";
  tag?: string;
  assignedTo?: number;
  page?: number;
}

// Cache for column mappings per project
const columnCache: Map<number, Map<number, string>> = new Map();
const columnNameToIdCache: Map<number, Map<string, number>> = new Map();

/**
 * Get column mappings for a project (cached)
 */
export async function getColumnMappings(
  projectId: number,
): Promise<{ idToName: Map<number, string>; nameToId: Map<string, number> }> {
  if (!columnCache.has(projectId)) {
    const result = await listColumns(projectId);
    const idToName = new Map<number, string>();
    const nameToId = new Map<string, number>();

    for (const col of result.columns) {
      idToName.set(col.id, col.name);
      nameToId.set(col.name.toLowerCase(), col.id);
    }

    columnCache.set(projectId, idToName);
    columnNameToIdCache.set(projectId, nameToId);
  }

  return {
    idToName: columnCache.get(projectId)!,
    nameToId: columnNameToIdCache.get(projectId)!,
  };
}

/**
 * Get status name from status_id using project columns
 */
export async function getStatusNameForProject(
  projectId: number,
  statusId: number,
): Promise<string> {
  const { idToName } = await getColumnMappings(projectId);
  return idToName.get(statusId) ?? "unknown";
}

/**
 * List tasks for a project with optional filters
 * Filters are applied client-side because BugHerd API doesn't reliably filter by custom column names
 */
export async function listTasks(
  projectId: number,
  options: ListTasksOptions = {},
): Promise<BugherdTasksResponse> {
  const params = new URLSearchParams();

  // Priority filter works server-side
  if (options.priority) params.set("priority", options.priority);
  if (options.tag) params.set("tag", options.tag);
  if (options.assignedTo) params.set("assigned_to_id", options.assignedTo.toString());
  if (options.page) params.set("page", options.page.toString());

  const query = params.toString();
  const endpoint = `/projects/${projectId}/tasks.json${query ? `?${query}` : ""}`;

  const result = await bugherdRequest<BugherdTasksResponse>(endpoint);

  // Apply status filter client-side for custom columns
  if (options.status) {
    const { nameToId } = await getColumnMappings(projectId);
    const targetStatusLower = options.status.toLowerCase();

    // Find the column ID for the requested status
    const targetColumnId = nameToId.get(targetStatusLower);

    if (targetColumnId !== undefined) {
      // Filter tasks by status_id matching the column ID
      result.tasks = result.tasks.filter((task) => task.status_id === targetColumnId);
      result.meta.count = result.tasks.length;
    }
  }

  return result;
}

/**
 * Get a single task by ID
 */
export async function getTask(projectId: number, taskId: number): Promise<BugherdTaskResponse> {
  return bugherdRequest<BugherdTaskResponse>(`/projects/${projectId}/tasks/${taskId}.json`);
}

/**
 * Get a task globally (without project_id)
 */
export async function getTaskGlobal(taskId: number): Promise<BugherdTaskResponse> {
  return bugherdRequest<BugherdTaskResponse>(`/tasks/${taskId}.json`);
}

/**
 * Get a task by local ID (#123)
 */
export async function getTaskByLocalId(
  projectId: number,
  localTaskId: number,
): Promise<BugherdTaskResponse> {
  return bugherdRequest<BugherdTaskResponse>(
    `/projects/${projectId}/local_tasks/${localTaskId}.json`,
  );
}

/**
 * List feedback tasks (unprocessed/new)
 */
export async function listFeedbackTasks(
  projectId: number,
  page?: number,
): Promise<BugherdTasksResponse> {
  const params = page ? `?page=${page}` : "";
  return bugherdRequest<BugherdTasksResponse>(
    `/projects/${projectId}/tasks/feedback.json${params}`,
  );
}

/**
 * List archived tasks
 */
export async function listArchivedTasks(
  projectId: number,
  page?: number,
): Promise<BugherdTasksResponse> {
  const params = page ? `?page=${page}` : "";
  return bugherdRequest<BugherdTasksResponse>(`/projects/${projectId}/tasks/archive.json${params}`);
}

/**
 * List taskboard tasks (not feedback, not archived)
 */
export async function listTaskboardTasks(
  projectId: number,
  page?: number,
): Promise<BugherdTasksResponse> {
  const params = page ? `?page=${page}` : "";
  return bugherdRequest<BugherdTasksResponse>(
    `/projects/${projectId}/tasks/taskboard.json${params}`,
  );
}

export interface CreateTaskData {
  description: string;
  priority?: "critical" | "important" | "normal" | "minor";
  status?: string;
  tag_names?: string[];
  assigned_to_id?: number;
  requester_email?: string;
  external_id?: string;
}

/**
 * Create a new task
 */
export async function createTask(
  projectId: number,
  data: CreateTaskData,
): Promise<BugherdTaskResponse> {
  return bugherdRequest<BugherdTaskResponse>(`/projects/${projectId}/tasks.json`, {
    method: "POST",
    body: JSON.stringify({ task: data }),
  });
}

/**
 * Move tasks between projects
 */
export async function moveTasks(
  projectId: number,
  taskIds: number[],
  destinationProjectId: number,
): Promise<void> {
  await bugherdRequest<void>(`/projects/${projectId}/tasks/move_tasks.json`, {
    method: "POST",
    body: JSON.stringify({
      task_ids: taskIds,
      destination_project_id: destinationProjectId,
    }),
  });
}

export interface UpdateTaskOptions {
  status?: string; // Can be standard (backlog, todo, doing, done, closed) or custom column name
  priority?: "critical" | "important" | "normal" | "minor";
  description?: string;
  assigned_to_id?: number | null;
}

/**
 * Update a task's status, priority, description, or assignee
 * BugHerd API expects status/priority as strings, not IDs
 */
export async function updateTask(
  projectId: number,
  taskId: number,
  options: UpdateTaskOptions,
): Promise<BugherdTaskResponse & { _debug?: { request: unknown; rawResponse?: string } }> {
  const task: Record<string, unknown> = {};

  // BugHerd API uses string values for status and priority
  if (options.status) task.status = options.status;
  if (options.priority) task.priority = options.priority;
  if (options.description !== undefined) task.description = options.description;
  if (options.assigned_to_id !== undefined) task.assigned_to_id = options.assigned_to_id;

  const requestBody = { task };
  const endpoint = `/projects/${projectId}/tasks/${taskId}.json`;

  // Make raw request to capture full response
  const apiKey = process.env.BUGHERD_API_KEY;
  if (!apiKey) {
    throw new Error("BUGHERD_API_KEY environment variable is required.");
  }
  const auth = Buffer.from(`${apiKey}:x`).toString("base64");
  const url = `https://www.bugherd.com/api_v2${endpoint}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const rawText = await response.text();
  let parsed: BugherdTaskResponse;

  try {
    parsed = JSON.parse(rawText);
  } catch (parseError) {
    console.error(
      "[updateTask] JSON parse failed:",
      parseError instanceof Error ? parseError.message : String(parseError),
    );
    throw new Error(`BugHerd returned invalid JSON: ${rawText}`);
  }

  // Add debug info
  return {
    ...parsed,
    _debug: {
      request: { method: "PUT", url, body: requestBody },
      rawResponse: rawText.substring(0, 500),
    },
  };
}

// ============================================================================
// Columns (for custom Kanban boards)
// ============================================================================

/**
 * List all columns (statuses) for a project
 * Projects with custom Kanban boards have custom column IDs
 */
export async function listColumns(projectId: number): Promise<BugherdColumnsResponse> {
  return bugherdRequest<BugherdColumnsResponse>(`/projects/${projectId}/columns.json`);
}

/**
 * Get a single column by ID
 */
export async function getColumn(
  projectId: number,
  columnId: number,
): Promise<BugherdColumnResponse> {
  return bugherdRequest<BugherdColumnResponse>(`/projects/${projectId}/columns/${columnId}.json`);
}

export interface CreateColumnData {
  name: string;
  position?: number;
}

/**
 * Create a new column
 */
export async function createColumn(
  projectId: number,
  data: CreateColumnData,
): Promise<BugherdColumnResponse> {
  return bugherdRequest<BugherdColumnResponse>(`/projects/${projectId}/columns.json`, {
    method: "POST",
    body: JSON.stringify({ column: data }),
  });
}

export interface UpdateColumnData {
  name?: string;
  position?: number;
}

/**
 * Update a column
 */
export async function updateColumn(
  projectId: number,
  columnId: number,
  data: UpdateColumnData,
): Promise<BugherdColumnResponse> {
  return bugherdRequest<BugherdColumnResponse>(`/projects/${projectId}/columns/${columnId}.json`, {
    method: "PUT",
    body: JSON.stringify({ column: data }),
  });
}

// ============================================================================
// Comments
// ============================================================================

/**
 * List comments for a task
 */
export async function listComments(
  projectId: number,
  taskId: number,
): Promise<BugherdCommentsResponse> {
  return bugherdRequest<BugherdCommentsResponse>(
    `/projects/${projectId}/tasks/${taskId}/comments.json`,
  );
}

export interface CreateCommentData {
  text: string;
  user_id?: number;
  email?: string;
}

/**
 * Create a comment on a task
 */
export async function createComment(
  projectId: number,
  taskId: number,
  data: CreateCommentData,
): Promise<{ comment: { id: number; text: string; created_at: string } }> {
  return bugherdRequest<{
    comment: { id: number; text: string; created_at: string };
  }>(`/projects/${projectId}/tasks/${taskId}/comments.json`, {
    method: "POST",
    body: JSON.stringify({ comment: data }),
  });
}

// ============================================================================
// Attachments
// ============================================================================

/**
 * List attachments for a task
 */
export async function listAttachments(
  projectId: number,
  taskId: number,
): Promise<BugherdAttachmentsResponse> {
  return bugherdRequest<BugherdAttachmentsResponse>(
    `/projects/${projectId}/tasks/${taskId}/attachments.json`,
  );
}

/**
 * Get a single attachment
 */
export async function getAttachment(
  projectId: number,
  taskId: number,
  attachmentId: number,
): Promise<BugherdAttachmentResponse> {
  return bugherdRequest<BugherdAttachmentResponse>(
    `/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}.json`,
  );
}

export interface CreateAttachmentData {
  file_name: string;
  url: string;
}

/**
 * Create an attachment from a URL
 */
export async function createAttachment(
  projectId: number,
  taskId: number,
  data: CreateAttachmentData,
): Promise<BugherdAttachmentResponse> {
  return bugherdRequest<BugherdAttachmentResponse>(
    `/projects/${projectId}/tasks/${taskId}/attachments.json`,
    {
      method: "POST",
      body: JSON.stringify({ attachment: data }),
    },
  );
}

/**
 * Upload a file as attachment (multipart/form-data)
 * Note: Requires special handling for file upload
 */
export async function uploadAttachment(
  projectId: number,
  taskId: number,
  fileName: string,
  fileContent: ArrayBuffer | Uint8Array,
  mimeType: string = "application/octet-stream",
): Promise<BugherdAttachmentResponse> {
  const apiKey = getApiKey();
  const auth = Buffer.from(`${apiKey}:x`).toString("base64");

  const formData = new FormData();
  // Convert to ArrayBuffer for Blob compatibility
  const arrayBuffer =
    fileContent instanceof ArrayBuffer
      ? fileContent
      : fileContent.buffer.slice(
          fileContent.byteOffset,
          fileContent.byteOffset + fileContent.byteLength,
        );
  const blob = new Blob([arrayBuffer as ArrayBuffer], { type: mimeType });
  formData.append("file", blob, fileName);

  const url = `${BUGHERD_BASE_URL}/projects/${projectId}/tasks/${taskId}/attachments/upload`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`BugHerd API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<BugherdAttachmentResponse>;
}

/**
 * Delete an attachment (DESTRUCTIVE)
 */
export async function deleteAttachment(
  projectId: number,
  taskId: number,
  attachmentId: number,
): Promise<void> {
  await bugherdRequest<void>(
    `/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}.json`,
    {
      method: "DELETE",
    },
  );
}

// ============================================================================
// Webhooks
// ============================================================================

/**
 * List all webhooks
 */
export async function listWebhooks(): Promise<BugherdWebhooksResponse> {
  return bugherdRequest<BugherdWebhooksResponse>("/webhooks.json");
}

export interface CreateWebhookData {
  event: BugherdWebhookEvent;
  target_url: string;
  project_id?: number;
}

/**
 * Create a webhook
 */
export async function createWebhook(data: CreateWebhookData): Promise<BugherdWebhookResponse> {
  return bugherdRequest<BugherdWebhookResponse>("/webhooks.json", {
    method: "POST",
    body: JSON.stringify({ webhook: data }),
  });
}

/**
 * Delete a webhook (DESTRUCTIVE)
 */
export async function deleteWebhook(webhookId: number): Promise<void> {
  await bugherdRequest<void>(`/webhooks/${webhookId}.json`, {
    method: "DELETE",
  });
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * Verify API connection by fetching organization info
 */
export async function verifyConnection(): Promise<boolean> {
  try {
    await listProjects();
    return true;
  } catch (err) {
    console.error(
      "[verifyConnection] Check failed:",
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}
