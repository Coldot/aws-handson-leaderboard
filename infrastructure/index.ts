import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as fs from "fs";
import * as path from "path";
import * as mime from "mime";

function injectApiUrl(filePath: string, apiUrl: string) {
    let content = fs.readFileSync(filePath, 'utf8');
    content = content.replace('https://your-api-gateway-url.amazonaws.com/prod', apiUrl + 'prod');
    return content;
}

function uploadDirectory(directoryPath: string, bucket: aws.s3.Bucket, apiUrl: string) {
    const files = fs.readdirSync(directoryPath);
    for (const file of files) {
        const filePath = path.join(directoryPath, file);
        if (fs.statSync(filePath).isDirectory()) {
            uploadDirectory(filePath, bucket, apiUrl);
        } else {
            let content: pulumi.asset.Asset;
            if (path.extname(file) === '.js') {
                content = new pulumi.asset.StringAsset(injectApiUrl(filePath, apiUrl));
            } else {
                content = new pulumi.asset.FileAsset(filePath);
            }
            
            new aws.s3.BucketObject(file, {
                bucket: bucket,
                source: content,
                contentType: mime.getType(filePath) || undefined,
            });
        }
    }
}


const leaderboardTable = new aws.dynamodb.Table("Leaderboard", {
    name: "Leaderboard",
    attributes: [
        { name: "name", type: "S" },
        { name: "score", type: "N" },
        { name: "game", type: "S" },
    ],
    hashKey: "name",
    rangeKey: "score",
    billingMode: "PROVISIONED",
    readCapacity: 5,
    writeCapacity: 5,
    globalSecondaryIndexes: [{
        name: "ScoreIndex",
        hashKey: "game",
        rangeKey: "score",
        projectionType: "ALL",
        readCapacity: 5,
        writeCapacity: 5,
    }],
});

const lambdaRole = new aws.iam.Role("lambdaRole", {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: "sts:AssumeRole",
            Principal: {
                Service: "lambda.amazonaws.com"
            },
            Effect: "Allow",
            Sid: ""
        }]
    })
});

new aws.iam.RolePolicyAttachment("lambdaRolePolicy", {
    role: lambdaRole.name,
    policyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
});

new aws.iam.RolePolicyAttachment("lambdaDynamoDBPolicy", {
    role: lambdaRole.name,
    policyArn: "arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess"
});

const lambdaFunc = new aws.lambda.Function("leaderboardFunction", {
    code: new pulumi.asset.AssetArchive({
        ".": new pulumi.asset.FileArchive("../backend")
    }),
    handler: "lambda_function.lambda_handler",
    role: lambdaRole.arn,
    runtime: "python3.8",
    memorySize: 128,
});

const api = new aws.apigateway.RestApi("leaderboardApi", {
    description: "Leaderboard API",
});

const resource = new aws.apigateway.Resource("leaderboardResource", {
    restApi: api.id,
    parentId: api.rootResourceId,
    pathPart: "scores"
});

const method = new aws.apigateway.Method("leaderboardMethod", {
    restApi: api.id,
    resourceId: resource.id,
    httpMethod: "ANY",
    authorization: "NONE",
});

const integration = new aws.apigateway.Integration("leaderboardIntegration", {
    restApi: api.id,
    resourceId: resource.id,
    httpMethod: method.httpMethod,
    integrationHttpMethod: "POST",
    type: "AWS_PROXY",
    uri: lambdaFunc.invokeArn,
});

const deployment = new aws.apigateway.Deployment("apiDeployment", {
    restApi: api.id,
}, { dependsOn: [method, integration] });

const stage = new aws.apigateway.Stage("prodStage", {
    restApi: api.id,
    deployment: deployment.id,
    stageName: "prod",
});

new aws.lambda.Permission("apiGatewayPermission", {
    action: "lambda:InvokeFunction",
    function: lambdaFunc.name,
    principal: "apigateway.amazonaws.com",
    sourceArn: pulumi.interpolate`${api.executionArn}/*/*`
});

const websiteBucket = new aws.s3.Bucket("clickgame-frontend-bucket", {
    website: {
        indexDocument: "index.html",
    },
});

const originAccessIdentity = new aws.cloudfront.OriginAccessIdentity("originAccessIdentity", {
    comment: "OAI for website bucket",
});

const bucketPolicy = new aws.s3.BucketPolicy("bucketPolicy", {
    bucket: websiteBucket.id,
    policy: pulumi.all([websiteBucket.arn, originAccessIdentity.iamArn]).apply(([bucketArn, oaiArn]) => JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Effect: "Allow",
            Principal: {
                AWS: oaiArn,
            },
            Action: "s3:GetObject",
            Resource: `${bucketArn}/*`,
        }],
    })),
});

const apiUrl = deployment.invokeUrl;

const frontendPath = "../frontend";
apiUrl.apply(url => uploadDirectory(frontendPath, websiteBucket, url));

const distribution = new aws.cloudfront.Distribution("website-distribution", {
    origins: [{
        domainName: websiteBucket.bucketRegionalDomainName,
        originId: websiteBucket.arn,
        s3OriginConfig: {
            originAccessIdentity: originAccessIdentity.cloudfrontAccessIdentityPath,
        },
    }],
    enabled: true,
    isIpv6Enabled: true,
    defaultRootObject: "index.html",
    defaultCacheBehavior: {
        allowedMethods: ["GET", "HEAD", "OPTIONS"],
        cachedMethods: ["GET", "HEAD", "OPTIONS"],
        targetOriginId: websiteBucket.arn,
        forwardedValues: {
            queryString: false,
            cookies: {
                forward: "none",
            },
        },
        viewerProtocolPolicy: "redirect-to-https",
        minTtl: 0,
        defaultTtl: 3600,
        maxTtl: 86400,
    },
    priceClass: "PriceClass_200",
    restrictions: {
        geoRestriction: {
            restrictionType: "none",
        },
    },
    viewerCertificate: {
        cloudfrontDefaultCertificate: true,
    },
});

export const websiteUrl = distribution.domainName;
export const apiEndpoint = apiUrl;