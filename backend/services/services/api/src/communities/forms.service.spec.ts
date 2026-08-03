import { randomUUID } from "node:crypto";
import type {
  CommunityGroup,
  CommunityGroupMember,
  CommunityGroupForm,
  CommunityJoinRequest,
  DecideRequestInput,
  FormPatch,
  FormsStore,
  JoinRequestStatus,
} from "./forms.service";
import { FormsService } from "./forms.service";

/**
 * An in-memory stand-in for the Drizzle-backed store, mirroring
 * `FakeGroupsStore`: plain arrays plus the handful of reads the service
 * performs. Mocking Drizzle's builder chain method-by-method would let a broken
 * WHERE clause pass, so the double sits at the store boundary instead.
 *
 * IT DECIDES NOTHING. Every method applies exactly the payload it is handed —
 * no status is chosen here, no role is derived here, no authorization is
 * re-implemented here. Five earlier tests in this project shipped green while
 * asserting against a fake's own reimplementation of the rule under test; the
 * only defence is a double with no rules in it.
 */
class FakeFormsStore implements FormsStore {
  groups: CommunityGroup[] = [];
  members: CommunityGroupMember[] = [];
  forms: CommunityGroupForm[] = [];
  requests: CommunityJoinRequest[] = [];

  /** The exact payload the SERVICE built, captured for assertion. */
  lastDecision: DecideRequestInput | null = null;
  lastFormPatch: (FormPatch & { groupId: string }) | null = null;
  /** Forces the activation half of `decideRequest` to blow up mid-transaction. */
  failActivation = false;

  private async transaction<T>(body: () => Promise<T>): Promise<T> {
    const snapshot = {
      groups: this.groups.map((row) => ({ ...row })),
      members: this.members.map((row) => ({ ...row })),
      requests: this.requests.map((row) => ({ ...row })),
    };
    try {
      return await body();
    } catch (error) {
      this.groups = snapshot.groups;
      this.members = snapshot.members;
      this.requests = snapshot.requests;
      throw error;
    }
  }

  async findGroup(groupId: string): Promise<CommunityGroup | null> {
    return this.groups.find((row) => row.id === groupId) ?? null;
  }

  async findMembership(
    groupId: string,
    userId: string,
  ): Promise<CommunityGroupMember | null> {
    return (
      this.members.find(
        (row) => row.groupId === groupId && row.userId === userId,
      ) ?? null
    );
  }

  async findForm(groupId: string): Promise<CommunityGroupForm | null> {
    return this.forms.find((row) => row.groupId === groupId) ?? null;
  }

  async upsertForm(
    groupId: string,
    patch: FormPatch,
  ): Promise<CommunityGroupForm> {
    this.lastFormPatch = { groupId, ...patch };
    const existing = this.forms.find((row) => row.groupId === groupId);
    if (existing) {
      existing.questions = patch.questions;
      existing.updatedAt = patch.updatedAt;
      return existing;
    }
    const row: CommunityGroupForm = {
      groupId,
      questions: patch.questions,
      updatedAt: patch.updatedAt,
    };
    this.forms.push(row);
    return row;
  }

  async listRequests(
    groupId: string,
    status: JoinRequestStatus | null,
  ): Promise<CommunityJoinRequest[]> {
    return this.requests
      .filter((row) => row.groupId === groupId)
      .filter((row) => (status ? row.status === status : true))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async findRequest(requestId: string): Promise<CommunityJoinRequest | null> {
    return this.requests.find((row) => row.id === requestId) ?? null;
  }

  async decideRequest(input: DecideRequestInput): Promise<{
    request: CommunityJoinRequest;
    membership: CommunityGroupMember | null;
  }> {
    this.lastDecision = input;
    return this.transaction(async () => {
      const request = this.requests.find((row) => row.id === input.requestId);
      if (!request) throw new Error("no such request");
      // Applied, not decided: whatever the service put in `decision` is what
      // lands on the row.
      request.status = input.decision.status;
      request.decidedBy = input.decision.decidedBy;
      request.decidedAt = input.decision.decidedAt;

      let membership: CommunityGroupMember | null = null;
      if (input.activate) {
        if (this.failActivation) throw new Error("activation exploded");
        const activate = input.activate;
        const existing = this.members.find(
          (row) =>
            row.groupId === activate.groupId && row.userId === activate.userId,
        );
        const wasActive = existing?.status === "active";
        if (existing) {
          existing.role = activate.role;
          existing.status = activate.status;
          membership = existing;
        } else {
          membership = {
            id: randomUUID(),
            groupId: activate.groupId,
            userId: activate.userId,
            role: activate.role,
            status: activate.status,
            joinedAt: new Date(),
          };
          this.members.push(membership);
        }
        if (!wasActive) {
          const group = this.groups.find((row) => row.id === activate.groupId);
          if (group) group.memberCount += 1;
        }
      }
      return { request, membership };
    });
  }

  // ---- fixture helpers -----------------------------------------------------

  addGroup(overrides: Partial<CommunityGroup> = {}): CommunityGroup {
    const row: CommunityGroup = {
      id: randomUUID(),
      slug: `group-${this.groups.length}`,
      name: "Chevening 2027",
      description: null,
      opportunityId: null,
      ownerId: "user_owner",
      visibility: "public",
      joinPolicy: "request",
      coverEmoji: "💬",
      accent: null,
      expiresAt: null,
      archivedAt: null,
      memberCount: 1,
      messageCount: 0,
      lastMessageAt: null,
      createdAt: new Date(),
      ...overrides,
    };
    this.groups.push(row);
    return row;
  }

  addMember(
    groupId: string,
    userId: string,
    role = "member",
    status = "active",
  ): CommunityGroupMember {
    const row: CommunityGroupMember = {
      id: randomUUID(),
      groupId,
      userId,
      role,
      status,
      joinedAt: new Date(),
    };
    this.members.push(row);
    return row;
  }

  addRequest(
    groupId: string,
    userId: string,
    status = "pending",
    createdAt = new Date(),
  ): CommunityJoinRequest {
    const row: CommunityJoinRequest = {
      id: randomUUID(),
      groupId,
      userId,
      answers: [],
      status,
      decidedBy: null,
      decidedAt: null,
      createdAt,
    };
    this.requests.push(row);
    return row;
  }
}

const OWNER = "user_owner";
const MOD = "user_mod";
const MEMBER = "user_member";
const STRANGER = "user_stranger";
const APPLICANT = "user_applicant";

function setup() {
  const store = new FakeFormsStore();
  const service = new FormsService(store);
  return { store, service };
}

/** A group with an owner membership row, the shape `create` leaves behind. */
function ownedGroup(
  store: FakeFormsStore,
  overrides: Partial<CommunityGroup> = {},
) {
  const group = store.addGroup(overrides);
  store.addMember(group.id, OWNER, "owner", "active");
  return group;
}

describe("FormsService.getForm", () => {
  it("lets a prospective joiner read the questions of a public group", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);
    store.forms.push({
      groupId: group.id,
      questions: [
        { id: "q1", type: "short_text", label: "Why?", required: true },
      ],
      updatedAt: new Date(),
    });

    const form = await service.getForm(STRANGER, group.id);

    expect(form.questions).toHaveLength(1);
  });

  it("returns an empty form for a group that has never set one", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);

    await expect(service.getForm(STRANGER, group.id)).resolves.toEqual({
      groupId: group.id,
      questions: [],
      updatedAt: null,
    });
  });

  it("refuses a stranger the questions of a private group", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store, { visibility: "private" });

    await expect(service.getForm(STRANGER, group.id)).rejects.toThrow(
      /private/i,
    );
  });

  it("lets an invitee read a private group's questions", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store, { visibility: "private" });
    store.addMember(group.id, STRANGER, "member", "invited");

    await expect(service.getForm(STRANGER, group.id)).resolves.toBeDefined();
  });

  it("refuses an unvetted applicant the questions of a private group", async () => {
    // `pending` is not readable — same rule canReadGroup applies to the group
    // itself, so the form and the group cannot disagree about who may see them.
    const { store, service } = setup();
    const group = ownedGroup(store, { visibility: "private" });
    store.addMember(group.id, APPLICANT, "member", "pending");

    await expect(service.getForm(APPLICANT, group.id)).rejects.toThrow(
      /private/i,
    );
  });

  it("404s an unknown group", async () => {
    const { service } = setup();
    await expect(service.getForm(STRANGER, randomUUID())).rejects.toThrow(
      /not found/i,
    );
  });

  it("rejects a non-uuid group id with a sentence, not a driver error", async () => {
    const { service } = setup();
    await expect(service.getForm(STRANGER, "not-a-uuid")).rejects.toThrow(
      /isn't valid/i,
    );
  });
});

describe("FormsService.setForm", () => {
  it("stores exactly the questions the owner supplied", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);
    const questions = [
      { id: "q1", type: "short_text" as const, label: "Why?", required: true },
    ];

    await service.setForm(OWNER, group.id, { questions });

    expect(store.lastFormPatch?.questions).toEqual(questions);
    expect(store.lastFormPatch?.updatedAt).toBeInstanceOf(Date);
  });

  it("refuses a moderator — the form is an owner's decision", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);
    store.addMember(group.id, MOD, "mod", "active");

    await expect(
      service.setForm(MOD, group.id, { questions: [] }),
    ).rejects.toThrow(/Only an owner/i);
  });

  it("refuses a stranger", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);

    await expect(
      service.setForm(STRANGER, group.id, { questions: [] }),
    ).rejects.toThrow(/Only an owner/i);
  });

  it("refuses two questions sharing an id — answers key on it", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);

    await expect(
      service.setForm(OWNER, group.id, {
        questions: [
          { id: "q1", type: "short_text", label: "Why?", required: false },
          { id: "q1", type: "long_text", label: "How?", required: false },
        ],
      }),
    ).rejects.toThrow(/its own id/i);
    expect(store.forms).toHaveLength(0);
  });

  it("refuses to change the form of an archived group", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store, { archivedAt: new Date() });

    await expect(
      service.setForm(OWNER, group.id, { questions: [] }),
    ).rejects.toThrow(/archived/i);
  });

  it("honours a removed row over owner_id", async () => {
    // The departure rule from community-authz: a `removed` membership beats
    // `community_groups.owner_id`, because it is a decision, not drift.
    const { store, service } = setup();
    const group = store.addGroup({ ownerId: OWNER });
    store.addMember(group.id, OWNER, "owner", "removed");

    await expect(
      service.setForm(OWNER, group.id, { questions: [] }),
    ).rejects.toThrow(/Only an owner/i);
  });
});

describe("FormsService.listRequests", () => {
  it("lets a MODERATOR read the queue they exist to review", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);
    store.addMember(group.id, MOD, "mod", "active");
    store.addRequest(group.id, APPLICANT);

    const rows = await service.listRequests(MOD, group.id);

    expect(rows).toHaveLength(1);
  });

  it("lets the owner read the queue", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);
    store.addRequest(group.id, APPLICANT);

    await expect(service.listRequests(OWNER, group.id)).resolves.toHaveLength(
      1,
    );
  });

  it("refuses an ordinary member", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);
    store.addMember(group.id, MEMBER, "member", "active");

    await expect(service.listRequests(MEMBER, group.id)).rejects.toThrow(
      /not allowed/i,
    );
  });

  it("refuses a stranger", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);

    await expect(service.listRequests(STRANGER, group.id)).rejects.toThrow(
      /not allowed/i,
    );
  });

  it("shows the pending queue by default, not decided history", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);
    store.addRequest(group.id, APPLICANT, "pending");
    store.addRequest(group.id, "user_old", "rejected");

    const rows = await service.listRequests(OWNER, group.id);

    expect(rows.map((row) => row.status)).toEqual(["pending"]);
  });

  it("can be asked for every request regardless of status", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);
    store.addRequest(group.id, APPLICANT, "pending");
    store.addRequest(group.id, "user_old", "rejected");

    await expect(
      service.listRequests(OWNER, group.id, "all"),
    ).resolves.toHaveLength(2);
  });

  it("rejects a status filter it does not recognise", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);

    await expect(
      service.listRequests(OWNER, group.id, "banished" as never),
    ).rejects.toThrow(/pending, approved, rejected/i);
  });
});

describe("FormsService.decide", () => {
  it("APPROVAL ACTIVATES THE MEMBER ROW", async () => {
    // The load-bearing behaviour of this service. `decide('approved')` is the
    // ONLY sanctioned path from a `pending` member row to `active`.
    const { store, service } = setup();
    const group = ownedGroup(store);
    const request = store.addRequest(group.id, APPLICANT);
    store.addMember(group.id, APPLICANT, "member", "pending");

    const result = await service.decide(OWNER, request.id, "approved");

    expect(result.membership?.status).toBe("active");
    expect(store.members.find((row) => row.userId === APPLICANT)?.status).toBe(
      "active",
    );
  });

  it("builds the activation payload in the SERVICE, not the store", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);
    const request = store.addRequest(group.id, APPLICANT);
    store.addMember(group.id, APPLICANT, "member", "pending");

    await service.decide(OWNER, request.id, "approved");

    expect(store.lastDecision?.activate).toEqual({
      groupId: group.id,
      userId: APPLICANT,
      role: "member",
      status: "active",
    });
    expect(store.lastDecision?.decision).toEqual({
      status: "approved",
      decidedBy: OWNER,
      decidedAt: expect.any(Date),
    });
  });

  it("counts the newly active member", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);
    const before = group.memberCount;
    const request = store.addRequest(group.id, APPLICANT);
    store.addMember(group.id, APPLICANT, "member", "pending");

    await service.decide(OWNER, request.id, "approved");

    expect(store.groups.find((row) => row.id === group.id)?.memberCount).toBe(
      before + 1,
    );
  });

  it("keeps a role the owner granted before approval", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);
    const request = store.addRequest(group.id, APPLICANT);
    store.addMember(group.id, APPLICANT, "mod", "pending");

    await service.decide(OWNER, request.id, "approved");

    expect(store.lastDecision?.activate?.role).toBe("mod");
  });

  it("activates an applicant whose membership row has vanished", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);
    const request = store.addRequest(group.id, APPLICANT);

    await service.decide(OWNER, request.id, "approved");

    expect(store.members.find((row) => row.userId === APPLICANT)?.status).toBe(
      "active",
    );
    expect(store.lastDecision?.activate?.role).toBe("member");
  });

  it("does not let approval launder a ban", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);
    const request = store.addRequest(group.id, APPLICANT);
    store.addMember(group.id, APPLICANT, "member", "banned");

    await expect(service.decide(OWNER, request.id, "approved")).rejects.toThrow(
      /banned/i,
    );
    expect(store.members.find((row) => row.userId === APPLICANT)?.status).toBe(
      "banned",
    );
    expect(store.requests[0].status).toBe("pending");
  });

  it("does not let a former owner's removed row come back as an owner", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);
    const request = store.addRequest(group.id, APPLICANT);
    store.addMember(group.id, APPLICANT, "owner", "removed");

    await service.decide(OWNER, request.id, "approved");

    expect(store.lastDecision?.activate?.role).toBe("member");
  });

  it("rejection decides the request and activates nobody", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);
    const request = store.addRequest(group.id, APPLICANT);
    store.addMember(group.id, APPLICANT, "member", "pending");

    const result = await service.decide(OWNER, request.id, "rejected");

    expect(result.request.status).toBe("rejected");
    expect(store.lastDecision?.activate).toBeNull();
    expect(store.members.find((row) => row.userId === APPLICANT)?.status).toBe(
      "pending",
    );
  });

  it("lets a moderator decide", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);
    store.addMember(group.id, MOD, "mod", "active");
    const request = store.addRequest(group.id, APPLICANT);

    await expect(
      service.decide(MOD, request.id, "approved"),
    ).resolves.toBeDefined();
  });

  it("refuses an ordinary member", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);
    store.addMember(group.id, MEMBER, "member", "active");
    const request = store.addRequest(group.id, APPLICANT);

    await expect(
      service.decide(MEMBER, request.id, "approved"),
    ).rejects.toThrow(/not allowed/i);
    expect(store.requests[0].status).toBe("pending");
  });

  it("refuses the applicant deciding their own request", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);
    const request = store.addRequest(group.id, APPLICANT);
    store.addMember(group.id, APPLICANT, "member", "pending");

    await expect(
      service.decide(APPLICANT, request.id, "approved"),
    ).rejects.toThrow(/not allowed/i);
  });

  it("refuses to re-decide a request that has already been reviewed", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);
    const request = store.addRequest(group.id, APPLICANT, "approved");

    await expect(service.decide(OWNER, request.id, "rejected")).rejects.toThrow(
      /already been reviewed/i,
    );
  });

  it("refuses to admit anyone to an archived group", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store, { archivedAt: new Date() });
    const request = store.addRequest(group.id, APPLICANT);

    await expect(service.decide(OWNER, request.id, "approved")).rejects.toThrow(
      /archived/i,
    );
  });

  it("refuses to admit anyone to a group whose deadline has passed", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store, { expiresAt: new Date(Date.now() - 1000) });
    const request = store.addRequest(group.id, APPLICANT);

    await expect(service.decide(OWNER, request.id, "approved")).rejects.toThrow(
      /deadline/i,
    );
  });

  it("still lets an owner clear the queue of an expired group by rejecting", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store, { expiresAt: new Date(Date.now() - 1000) });
    const request = store.addRequest(group.id, APPLICANT);

    await expect(
      service.decide(OWNER, request.id, "rejected"),
    ).resolves.toBeDefined();
  });

  it("404s an unknown request", async () => {
    const { service } = setup();
    await expect(
      service.decide(OWNER, randomUUID(), "approved"),
    ).rejects.toThrow(/not found/i);
  });

  it("rejects a decision that is neither approved nor rejected", async () => {
    const { store, service } = setup();
    const group = ownedGroup(store);
    const request = store.addRequest(group.id, APPLICANT);

    await expect(
      service.decide(OWNER, request.id, "maybe" as never),
    ).rejects.toThrow(/approve or reject/i);
  });

  it("leaves the request pending if the activation fails", async () => {
    // The request row and the member row move together or not at all: an
    // "approved" request whose member row never activated is an applicant the
    // owner believes they let in and who cannot post.
    const { store, service } = setup();
    const group = ownedGroup(store);
    const request = store.addRequest(group.id, APPLICANT);
    store.addMember(group.id, APPLICANT, "member", "pending");
    store.failActivation = true;

    await expect(
      service.decide(OWNER, request.id, "approved"),
    ).rejects.toThrow();
    expect(store.requests[0].status).toBe("pending");
    expect(store.members.find((row) => row.userId === APPLICANT)?.status).toBe(
      "pending",
    );
  });
});
