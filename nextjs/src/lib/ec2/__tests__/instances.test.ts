import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  DescribeInstancesCommand,
  type Instance,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
// import * as clientModule from '../client';
import {
  getInstance,
  listInstances,
  startInstance,
  stopInstance,
  terminateInstance,
} from "../instances";

// EC2クライアントのモック
const mockSend = mock(() => Promise.resolve({}));
const mockEC2Client = {
  send: mockSend,
  destroy: mock(() => {}),
};

function getFirstCallCommand<T>(mockFn: typeof mockSend): T | undefined {
  const calls = mockFn.mock.calls as unknown[][];
  return calls[0]?.[0] as T | undefined;
}

describe("EC2 Instances", () => {
  beforeEach(() => {
    // getEC2Clientをモック
    mock.module("../client", () => ({
      getEC2Client: () => mockEC2Client,
    }));
    mockSend.mockClear();
  });

  afterEach(() => {
    mock.restore();
  });

  describe("listInstances", () => {
    it("should return list of instances", async () => {
      const mockInstances: Partial<Instance>[] = [
        {
          InstanceId: "i-123456",
          InstanceType: "t2.micro",
          State: { Name: "running" },
          PublicIpAddress: "1.2.3.4",
          PrivateIpAddress: "10.0.0.1",
          Tags: [{ Key: "Name", Value: "test-instance" }],
        },
      ];

      mockSend.mockResolvedValueOnce({
        Reservations: [{ Instances: mockInstances }],
      });

      const instances = await listInstances();

      expect(instances).toHaveLength(1);
      expect(instances[0]).toEqual({
        instanceId: "i-123456",
        instanceType: "t2.micro",
        state: "running",
        publicIp: "1.2.3.4",
        privateIp: "10.0.0.1",
        name: "test-instance",
        launchTime: undefined,
        az: undefined,
      });
      expect(mockSend).toHaveBeenCalledWith(
        expect.any(DescribeInstancesCommand),
      );
    });

    it("should handle empty response", async () => {
      mockSend.mockResolvedValueOnce({});

      const instances = await listInstances();

      expect(instances).toHaveLength(0);
    });

    it("should apply filters when provided", async () => {
      const filters = [{ Name: "instance-state-name", Values: ["running"] }];
      mockSend.mockResolvedValueOnce({ Reservations: [] });

      await listInstances(filters);

      const command = getFirstCallCommand<DescribeInstancesCommand>(mockSend);
      expect(command).toBeInstanceOf(DescribeInstancesCommand);
    });
  });

  describe("getInstance", () => {
    it("should return instance details by ID", async () => {
      const mockInstance: Partial<Instance> = {
        InstanceId: "i-123456",
        InstanceType: "t2.micro",
      };

      mockSend.mockResolvedValueOnce({
        Reservations: [{ Instances: [mockInstance] }],
      });

      const instance = await getInstance("i-123456");

      expect(instance).toBeTruthy();
      expect(instance?.instanceId).toBe("i-123456");
    });

    it("should return null when instance not found", async () => {
      mockSend.mockResolvedValueOnce({ Reservations: [] });

      const instance = await getInstance("i-nonexistent");

      expect(instance).toBeNull();
    });
  });

  describe("startInstance", () => {
    it("should start an instance successfully", async () => {
      mockSend.mockResolvedValueOnce({});

      await startInstance("i-123456");

      expect(mockSend).toHaveBeenCalledWith(expect.any(StartInstancesCommand));
      const command = getFirstCallCommand<StartInstancesCommand>(mockSend);
      expect(command?.input).toEqual({ InstanceIds: ["i-123456"] });
    });

    it("should handle errors when starting instance", async () => {
      mockSend.mockRejectedValueOnce(new Error("Failed to start"));

      await expect(startInstance("i-123456")).rejects.toThrow(
        "Failed to start",
      );
    });
  });

  describe("stopInstance", () => {
    it("should stop an instance successfully", async () => {
      mockSend.mockResolvedValueOnce({});

      await stopInstance("i-123456");

      expect(mockSend).toHaveBeenCalledWith(expect.any(StopInstancesCommand));
      const command = getFirstCallCommand<StopInstancesCommand>(mockSend);
      expect(command?.input).toEqual({
        InstanceIds: ["i-123456"],
        Force: false,
      });
    });

    it("should force stop when requested", async () => {
      mockSend.mockResolvedValueOnce({});

      await stopInstance("i-123456", true);

      const command = getFirstCallCommand<StopInstancesCommand>(mockSend);
      expect(command?.input).toEqual({
        InstanceIds: ["i-123456"],
        Force: true,
      });
    });
  });

  describe("terminateInstance", () => {
    it("should terminate an instance successfully", async () => {
      mockSend.mockResolvedValueOnce({});

      await terminateInstance("i-123456");

      expect(mockSend).toHaveBeenCalledWith(
        expect.any(TerminateInstancesCommand),
      );
      const command = getFirstCallCommand<TerminateInstancesCommand>(mockSend);
      expect(command?.input).toEqual({ InstanceIds: ["i-123456"] });
    });

    it("should handle errors when terminating instance", async () => {
      mockSend.mockRejectedValueOnce(new Error("Failed to terminate"));

      await expect(terminateInstance("i-123456")).rejects.toThrow(
        "Failed to terminate",
      );
    });
  });
});
