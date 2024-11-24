import json
import boto3
from decimal import Decimal
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('Leaderboard')

def lambda_handler(event, context):
    http_method = event['httpMethod']

    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
    }
    
    if http_method == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': headers,
            'body': json.dumps('CORS preflight request successful')
        }
    
    if http_method == 'GET':
        return get_scores(headers)
    elif http_method == 'POST':
        return add_score(json.loads(event['body']), headers)
    else:
        return {
            'statusCode': 400,
            'headers': headers,
            'body': json.dumps('Unsupported HTTP method')
        }

def get_scores(headers):
    response = table.query(
        IndexName='ScoreIndex',
        KeyConditionExpression=Key('game').eq('clickgame'),
        ScanIndexForward=True,
        Limit=10,
    )
    
    items = response['Items']

    for i in range(len(items)):
        if 'score' in items[i] and type(items[i]['score']) == Decimal:
            items[i]['score'] = float(items[i]['score'])
    
    return {
        'statusCode': 200,
        'headers': headers,
        'body': json.dumps(items)
    }

def add_score(data, headers):
    table.put_item(Item={
        'name': data['name'],
        'score': Decimal(str(data['score'])),
        'game': 'clickgame'
    })
    
    return {
        'statusCode': 200,
        'headers': headers,
        'body': json.dumps('Score added successfully')
    }