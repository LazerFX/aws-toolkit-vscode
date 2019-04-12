/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as schema from 'cloudformation-schema-js-yaml'
import * as yaml from 'js-yaml'
import * as filesystem from '../filesystem'
import * as filesystemUtilities from '../filesystemUtilities'
import { SystemUtilities } from '../systemUtilities'

export namespace CloudFormation {
    export function validateProperties(
        {
            Handler,
            CodeUri,
            Runtime,
            ...rest
        }: Partial<ResourceProperties>
    ): ResourceProperties {
        if (!Handler) {
            throw new Error('Missing value: Handler')
        }

        if (!CodeUri) {
            throw new Error('Missing value: CodeUri')
        }

        if (!Runtime) {
            throw new Error('Missing value: Runtime')
        }

        return {
            Handler,
            CodeUri,
            Runtime,
            ...rest
        }
    }

    export interface ResourceProperties {
        Handler: string,
        CodeUri: string,
        Runtime?: string,
        Timeout?: number,
        Environment?: Environment
    }

    export interface Resource {
        Type: 'AWS::Serverless::Function',
        Properties?: ResourceProperties
    }

    // TODO: Can we automatically detect changes to the CFN spec and apply them here?
    // tslint:disable-next-line:max-line-length
    // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/parameters-section-structure.html#parameters-section-structure-properties
    export type ParameterType =
        'String' |
        'Number' |
        'List<Number>' |
        'CommaDelimitedList' |
        AWSSpecificParameterType |
        SSMParameterType

    // tslint:disable-next-line:max-line-length
    // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/parameters-section-structure.html#aws-specific-parameter-types
    type AWSSpecificParameterType =
        'AWS::EC2::AvailabilityZone::Name' |
        'AWS::EC2::Image::Id' |
        'AWS::EC2::KeyPair::KeyName' |
        'AWS::EC2::SecurityGroup::GroupName' |
        'AWS::EC2::SecurityGroup::Id' |
        'AWS::EC2::Subnet::Id' |
        'AWS::EC2::Volume::Id' |
        'AWS::EC2::VPC::Id' |
        'AWS::Route53::HostedZone::Id' |
        'List<AWS::EC2::AvailabilityZone::Name>' |
        'List<AWS::EC2::Image::Id>' |
        'List<AWS::EC2::Instance::Id>' |
        'List<AWS::EC2::SecurityGroup::GroupName>' |
        'List<AWS::EC2::SecurityGroup::Id>' |
        'List<AWS::EC2::Subnet::Id>' |
        'List<AWS::EC2::Volume::Id>' |
        'List<AWS::EC2::VPC::Id>' |
        'List<AWS::Route53::HostedZone::Id>'

    // tslint:disable-next-line:max-line-length
    // https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/parameters-section-structure.html#aws-ssm-parameter-types
    type SSMParameterType =
        'AWS::SSM::Parameter::Name' |
        'AWS::SSM::Parameter::Value<String>' |
        'AWS::SSM::Parameter::Value<List<String>>' |
        'AWS::SSM::Parameter::Value<CommaDelimitedList>' |
        'AWS::SSM::Parameter::Value<AWS::EC2::AvailabilityZone::Name>' |
        'AWS::SSM::Parameter::Value<AWS::EC2::Image::Id>' |
        'AWS::SSM::Parameter::Value<AWS::EC2::KeyPair::KeyName>' |
        'AWS::SSM::Parameter::ValueAWS::EC2::SecurityGroup::GroupName<>' |
        'AWS::SSM::Parameter::Value<AWS::EC2::SecurityGroup::Id>' |
        'AWS::SSM::Parameter::Value<AWS::EC2::Subnet::Id>' |
        'AWS::SSM::Parameter::Value<AWS::EC2::Volume::Id>' |
        'AWS::SSM::Parameter::Value<AWS::EC2::VPC::Id>' |
        'AWS::SSM::Parameter::Value<AWS::Route53::HostedZone::Id>' |
        'AWS::SSM::Parameter::Value<List<AWS::EC2::AvailabilityZone::Name>>' |
        'AWS::SSM::Parameter::Value<List<AWS::EC2::Image::Id>>' |
        'AWS::SSM::Parameter::Value<List<AWS::EC2::KeyPair::KeyName>>' |
        'AWS::SSM::Parameter::Value<List<AWS::EC2::SecurityGroup::GroupName>>' |
        'AWS::SSM::Parameter::Value<List<AWS::EC2::SecurityGroup::Id>>' |
        'AWS::SSM::Parameter::Value<List<AWS::EC2::Subnet::Id>>' |
        'AWS::SSM::Parameter::Value<List<AWS::EC2::Volume::Id>>' |
        'AWS::SSM::Parameter::Value<List<AWS::EC2::VPC::Id>>' |
        'AWS::SSM::Parameter::Value<List<AWS::Route53::HostedZone::Id>>'

    export interface Parameter {
        Type: ParameterType
        AllowedPattern?: string
        AllowValues?: string[]
        ConstraintDescription?: string
        Default?: any
        Description?: string
        MaxLength?: number
        MaxValue?: number
        MinLength?: number
        MinValue?: number
        NoEcho?: boolean
    }

    export interface Template {
        Parameters?: {
            [key: string]: Parameter | undefined
        }

        Resources?: {
            [key: string]: Resource | undefined
        }
    }

    export interface Environment {
        Variables?: {
            [varName: string]: string
        }
    }

    export async function load(
        filename: string
    ): Promise<Template> {

        if (!await SystemUtilities.fileExists(filename)) {
            throw new Error(`Template file not found: ${filename}`)
        }

        const templateAsYaml: string = await filesystemUtilities.readFileAsString(filename)
        const template = yaml.safeLoad(
            templateAsYaml,
            {
                schema: schema as yaml.SchemaDefinition
            }
        ) as Template
        validateTemplate(template)

        return template
    }

    export async function save(template: Template, filename: string): Promise<void> {
        const templateAsYaml: string = yaml.safeDump(template)

        await filesystem.writeFile(filename, templateAsYaml, 'utf8')
    }

    export function validateTemplate(template: Template): void {
        if (!template.Resources) {
            return
        }

        const lambdaResources = Object.getOwnPropertyNames(template.Resources)
            .map(key => template.Resources![key]!)
            .filter(resource => resource.Type === 'AWS::Serverless::Function')
            .map(resource => resource as Resource)

        if (lambdaResources.length <= 0) {
            throw new Error('Template does not contain any Lambda resources')
        }

        for (const lambdaResource of lambdaResources) {
            validateResource(lambdaResource)
        }
    }

    export function validateResource(resource: Resource): void {
        if (!resource.Type) {
            throw new Error('Missing or invalid value in Template for key: Type')
        }
        if (!!resource.Properties) {
            if (!resource.Properties.Handler || typeof resource.Properties.Handler !== 'string') {
                throw new Error('Missing or invalid value in Template for key: Handler')
            }
            if (!resource.Properties.CodeUri || typeof resource.Properties.CodeUri !== 'string') {
                throw new Error('Missing or invalid value in Template for key: CodeUri')
            }
            if (!!resource.Properties.Runtime && typeof resource.Properties.Runtime !== 'string') {
                throw new Error('Invalid value in Template for key: Runtime')
            }
            if (!!resource.Properties.Timeout && typeof resource.Properties.Timeout !== 'number') {
                throw new Error('Invalid value in Template for key: Timeout')
            }
            if (!!resource.Properties.Environment && !!resource.Properties.Environment.Variables) {
                for (const variable in resource.Properties.Environment.Variables) {
                    if (typeof resource.Properties.Environment.Variables[variable] !== 'string') {
                        throw new Error(`Invalid value in Template for key: ${variable}: expected string`)
                    }
                }
            }
        }
    }
}
