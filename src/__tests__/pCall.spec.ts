import { pCall } from "../pCall";

describe("pCall", () => {
  it("should call async function", async () => {
    const asyncFn = async (a: string, b: number) => {
      return Promise.resolve(a + b);
    };

    const result = await pCall(asyncFn, "a", 1);
    expect(result).toEqual("a1");
  });
  it("should call promise function", async () => {
    const asyncFn = (a: string, b: number) => {
      return new Promise((resolve) => {
        resolve(a + b);
      });
    };
    const result = await pCall(asyncFn, "a", 1);
    expect(result).toEqual("a1");
  });
  it("should call sync function", async () => {
    const func = (a: string, b: number) => a + b;
    const result = await pCall(func, "a", 1);
    expect(result).toEqual("a1");
  });
  it("should throw on async function", async () => {
    const asyncFn = async (a: string, b: number) => {
      throw new Error("error");
    };
    try {
      await pCall(asyncFn, "a", 1);
      fail("Should throw exception");
    } catch (e: any) {
      expect(e.message).toEqual("error");
    }
  });
  it("should throw on promise function", async () => {
    const asyncFn = (a: string, b: number) => {
      return new Promise((_, reject) => {
        reject(new Error("error"));
      });
    };
    try {
      await pCall(asyncFn, "a", 1);
      fail("Should throw exception");
    } catch (e: any) {
      expect(e.message).toEqual("error");
    }
  });
  it("should throw on sync function", async () => {
    const func = (a: string, b: number) => {
      throw new Error("error");
    };
    try {
      await pCall(func, "a", 1);
      fail("Should throw exception");
    } catch (e: any) {
      expect(e.message).toEqual("error");
    }
  });
});
