/**
 * EC2インスタンス操作
 */

import {
  DescribeInstancesCommand,
  type DescribeInstancesCommandInput,
  type Instance,
  type InstanceStateName,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
} from "@aws-sdk/client-ec2";
import { logger } from "../logger";
import { getEC2Client } from "./client";

export interface InstanceInfo {
  instanceId: string;
  instanceType: string;
  state: InstanceStateName | undefined;
  publicIp?: string;
  privateIp?: string;
  name?: string;
  launchTime?: Date;
  az?: string;
}

/**
 * EC2インスタンスの一覧を取得
 */
export async function listInstances(
  filters?: DescribeInstancesCommandInput["Filters"],
): Promise<InstanceInfo[]> {
  const client = getEC2Client();
  const instances: InstanceInfo[] = [];

  try {
    logger.info("Fetching EC2 instances...");

    const command = new DescribeInstancesCommand({
      Filters: filters,
    });

    const response = await client.send(command);

    if (response.Reservations) {
      for (const reservation of response.Reservations) {
        if (reservation.Instances) {
          for (const instance of reservation.Instances) {
            instances.push(parseInstance(instance));
          }
        }
      }
    }

    logger.success(`Found ${instances.length} instances`);
    return instances;
  } catch (error) {
    logger.error("Failed to list instances:", error);
    throw error;
  }
}

/**
 * 特定のインスタンスの情報を取得
 */
export async function getInstance(
  instanceId: string,
): Promise<InstanceInfo | null> {
  const instances = await listInstances([
    {
      Name: "instance-id",
      Values: [instanceId],
    },
  ]);

  return instances[0] ?? null;
}

/**
 * インスタンスを起動
 */
export async function startInstance(instanceId: string): Promise<void> {
  const client = getEC2Client();

  try {
    logger.info(`Starting instance ${instanceId}...`);

    const command = new StartInstancesCommand({
      InstanceIds: [instanceId],
    });

    await client.send(command);
    logger.success(`Instance ${instanceId} start initiated`);
  } catch (error) {
    logger.error(`Failed to start instance ${instanceId}:`, error);
    throw error;
  }
}

/**
 * インスタンスを停止
 */
export async function stopInstance(
  instanceId: string,
  force = false,
): Promise<void> {
  const client = getEC2Client();

  try {
    logger.info(`Stopping instance ${instanceId}...`);

    const command = new StopInstancesCommand({
      InstanceIds: [instanceId],
      Force: force,
    });

    await client.send(command);
    logger.success(`Instance ${instanceId} stop initiated`);
  } catch (error) {
    logger.error(`Failed to stop instance ${instanceId}:`, error);
    throw error;
  }
}

/**
 * インスタンスを終了
 */
export async function terminateInstance(instanceId: string): Promise<void> {
  const client = getEC2Client();

  try {
    logger.warn(`Terminating instance ${instanceId}...`);

    const command = new TerminateInstancesCommand({
      InstanceIds: [instanceId],
    });

    await client.send(command);
    logger.success(`Instance ${instanceId} termination initiated`);
  } catch (error) {
    logger.error(`Failed to terminate instance ${instanceId}:`, error);
    throw error;
  }
}

/**
 * インスタンス情報をパース
 */
function parseInstance(instance: Instance): InstanceInfo {
  const nameTag = instance.Tags?.find((tag) => tag.Key === "Name");

  return {
    instanceId: instance.InstanceId || "",
    instanceType: instance.InstanceType || "",
    state: instance.State?.Name,
    publicIp: instance.PublicIpAddress,
    privateIp: instance.PrivateIpAddress,
    name: nameTag?.Value,
    launchTime: instance.LaunchTime,
    az: instance.Placement?.AvailabilityZone,
  };
}
