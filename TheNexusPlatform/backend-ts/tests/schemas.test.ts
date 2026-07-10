import { describe, expect, it } from "vitest";

import { HttpError } from "../src/httpError";
import {
  adminAddRegistrationSchema,
  hookRegistrationSchema,
  offeringCreateSchema,
  offeringUpdateSchema,
  parseBody,
  parsePatch,
  signupSchema,
} from "../src/schemas";

describe("parseBody", () => {
  it("returns validated data on success", () => {
    const data = parseBody(signupSchema, {
      signup_type: "org",
      org_name: "Test Org",
      email: "a@b.com",
      password: "longenough",
    });
    expect(data.signup_type).toBe("org");
    expect(data.email).toBe("a@b.com");
  });

  it("throws a FastAPI-style 422 envelope on failure", () => {
    try {
      parseBody(signupSchema, { signup_type: "org", email: "not-an-email", password: "short" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      const he = err as HttpError;
      expect(he.status).toBe(422);
      const detail = he.detail as Array<{ loc: unknown[]; msg: string; type: string }>;
      expect(Array.isArray(detail)).toBe(true);
      for (const item of detail) {
        expect(item.loc[0]).toBe("body");
        expect(typeof item.msg).toBe("string");
        expect(typeof item.type).toBe("string");
      }
      const fields = detail.map((d) => d.loc[1]);
      expect(fields).toContain("email");
      expect(fields).toContain("password");
    }
  });

  it("applies defaults like Pydantic", () => {
    const data = parseBody(offeringCreateSchema, { name: "X", offering_type: "course" });
    expect(data.registration_open).toBe(false);
    expect(data.approval_mode).toBe("manual_approve");
    expect(data.platform_module).toBe("nexus_only");
    expect(data.metadata).toEqual({});
  });
});

describe("int coercion (Pydantic lax-mode parity)", () => {
  it("coerces numeric strings for age", () => {
    const data = parseBody(hookRegistrationSchema, { offering_id: "o1", age: "17" });
    expect(data.age).toBe(17);
  });

  it("accepts plain ints and null", () => {
    expect(parseBody(hookRegistrationSchema, { offering_id: "o1", age: 14 }).age).toBe(14);
    expect(parseBody(hookRegistrationSchema, { offering_id: "o1", age: null }).age).toBeNull();
  });

  it("rejects non-numeric strings and floats", () => {
    expect(() => parseBody(hookRegistrationSchema, { offering_id: "o1", age: "abc" })).toThrow(
      HttpError,
    );
    expect(() =>
      parseBody(adminAddRegistrationSchema, { email: "a@b.com", age: 17.5 }),
    ).toThrow(HttpError);
  });
});

describe("parsePatch (model_dump(exclude_unset=True) parity)", () => {
  it("drops absent keys", () => {
    const patch = parsePatch(offeringUpdateSchema, { name: "New Name" });
    expect(patch).toEqual({ name: "New Name" });
    expect("description" in patch).toBe(false);
  });

  it("keeps explicit nulls", () => {
    const patch = parsePatch(offeringUpdateSchema, { description: null });
    expect("description" in patch).toBe(true);
    expect(patch.description).toBeNull();
  });

  it("still validates provided values", () => {
    expect(() => parsePatch(offeringUpdateSchema, { status: "not-a-status" })).toThrow(HttpError);
  });

  it("ignores unknown keys (Pydantic default)", () => {
    const patch = parsePatch(offeringUpdateSchema, { name: "X", bogus: 1 });
    expect(patch).toEqual({ name: "X" });
  });
});
