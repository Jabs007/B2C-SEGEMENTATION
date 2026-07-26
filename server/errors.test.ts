import { describe, it, expect } from "vitest";
import {
  HttpError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from "../shared/_core/errors";

describe("HttpError", () => {
  it("sets statusCode and message", () => {
    const err = new HttpError(418, "I'm a teapot");
    expect(err.statusCode).toBe(418);
    expect(err.message).toBe("I'm a teapot");
    expect(err.name).toBe("HttpError");
  });

  it("is an instance of Error", () => {
    const err = new HttpError(500, "fail");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(HttpError);
  });
});

describe("BadRequestError (400)", () => {
  it("creates HttpError with status 400", () => {
    const err = BadRequestError("invalid input");
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe("invalid input");
  });
});

describe("UnauthorizedError (401)", () => {
  it("creates HttpError with status 401", () => {
    const err = UnauthorizedError("not logged in");
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(401);
    expect(err.message).toBe("not logged in");
  });
});

describe("ForbiddenError (403)", () => {
  it("creates HttpError with status 403", () => {
    const err = ForbiddenError("no permission");
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe("no permission");
  });
});

describe("NotFoundError (404)", () => {
  it("creates HttpError with status 404", () => {
    const err = NotFoundError("resource missing");
    expect(err).toBeInstanceOf(HttpError);
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe("resource missing");
  });
});
