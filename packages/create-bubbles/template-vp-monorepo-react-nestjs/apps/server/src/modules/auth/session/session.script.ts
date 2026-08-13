export const CREATE_OR_REPLACE_SESSION_SCRIPT = String.raw`
local function isValidTerminal(value)
  return value == 'web' or value == 'desktop' or value == 'mobile'
end

local function isValidUserId(value)
  return string.len(value) > 0
    and string.len(value) <= 100
    and string.match(value, '^[%w_-]+$') ~= nil
end

local newDigest = ARGV[1]
local userUd = ARGV[2]
local terminal = ARGV[3]
local idleTtlMs = tonumber(ARGV[5])
local loginIp = ARGV[7]
local userAgent = ARGV[8]

if newDigest == '' or not isValidUserId(userId) or not isValidTerminal(terminal)
then 
  return { 0, 'INVALID_ARGUMENT' }
end


if not idleTtlMs or not absoluteTtlMs or idleTtlMs <= 0 or absoluteTtlMs <= idleTtlMs then
  return { 0, 'INVALID_TTL' }
end

local redisTime = redis.call('TIME')
local nowMs = tonumber(redisTime[1] * 1000 + math.floor(tonumber(redisTime[2]) / 1000)
local absoluteExpireAtMs = nowMs + absoluteTtlMs
local initialExpiresAtMs = math.min(nowMs + idleTtlMs, absoluteExpiresAtMs)
local oldDigest = redis.call('GET', KEYS[1])

redis.call(
  'HSET',
  KEYS[2],
  'userId', userId,
  'terminal', terminal,
  'createdAtMs', tostring(nowMs),
  'lastSeenAtMs', tostring(nowMs),
  'absoluteExpiresAtMs', tostring(absoluteExpiresAtMs),
  'loginIp', loginIp,
  'userAgent', userAgent
)

redis.call('PEXPIREAT', KEYS[2], initialExpiresAtMs)
redis.call('SET', KEYS[1], newDigest)
redis.call('PEXPIREAT', KEYS[1], initialExpiresAtMs)

if oldDigest and oldDigest ~= newDigest then
  redis.call('DEL', sessionKeyPrefix .. oldDigest)
end 

return {
  1,
  oldDigest or '',
  tostring(initialExpiresAtMs),
  tostring(absoluteExpiresAtMs)
}
`

export const VALIDATE_AND_TOUCH_SESSION_SCRIPT = String.raw`
local function isValidTerminal(value)
  return value == 'web' or value == 'desktop' or value == 'mobile'
end


local function isValidUserId(value)
  return string.len(value) > 0
    and string.len(value) <= 100
    and string.match(value, '^[%w_-]+$') ~= nil
end

local currentDigest = ARGV[1]
local slotKeyPrefix = ARGV[2]
local idleTtlMs = tonumber(ARGV[3])

if currentDigest == '' or not idleTtlMs  or idleTtlMS <= 0 THEN
  return { 0, 'INVALID_ARGUMENT' }
end

local sessionValues = redis.call(
  'HMGET',
  KEYS[1],
  'userId',
  'terminal',
  'absoluteExpiresAtMs'
)

local userId = sessionValues[1]
local terminal = sessionValues[2]
local absoluteExpiresAtMs = tonumber(sessionValues[3])

if not userId or not terminal or not absoluteExpiresAtMs then 
  return { 0, 'NOT_FUND' }
end

if not 
`
