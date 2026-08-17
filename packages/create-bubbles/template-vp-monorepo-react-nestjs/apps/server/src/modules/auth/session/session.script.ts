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
local userId = ARGV[2]
local terminal = ARGV[3]
local idleTtlMs = tonumber(ARGV[4])
local absoluteTtlMs = tonumber(ARGV[5])
local loginIp = ARGV[6]
local userAgent = ARGV[7]

if newDigest == '' or not isValidUserId(userId) or not isValidTerminal(terminal)
then 
  return { 0, 'INVALID_ARGUMENT' }
end


if not idleTtlMs or not absoluteTtlMs or idleTtlMs <= 0 or absoluteTtlMs <= idleTtlMs then
  return { 0, 'INVALID_TTL' }
end

local redisTime = redis.call('TIME')
local nowMs = tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)
local absoluteExpiresAtMs = nowMs + absoluteTtlMs
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

if currentDigest == '' or not idleTtlMs  or idleTtlMS <= 0 then
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

if not isValidUserId(userId) or not isValidTerminal(terminal) then
  return { 0, 'INVALID_SESSION_DATA' }
end

local slotKey = slotKeyPrefix .. userId .. ':' .. terminal
local slotDigest = redis.call('GET', slotKey)

if slotDigest ~= currentDigest then
  redis.call('DEL', KEYS[1])
  return { 0, 'REPLACED' }
end

local redisTime = redis.call('TIME')
local nowMs = tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)


if nowMs >= absoluteExpiresAtMs then
  redis.call('DEL', KEYS[1])
  redis.call('DEL', slotKey)
  return { 0, 'ABSOLUTE_EXPIRED' }
end

local expiresAtMs = math.min(nowMs + idleTtlMs, absoluteExpiresAtMs)
redis.call('HSET', KEYS[1], 'lastSeenAtMs', tostring(nowMs))
redis.call('PEXPIREAT', KEYS[1], expiresAtMs)
redis.call('PEXPIREAT', slotKey, expiresAtMs)

return {
  1,
  userId,
  terminal,
  tostring(expiresAtMs)
}
`

export const LOGOUT_SESSION_SCRIPT = String.raw`
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

local sessionValues = redis.call(
  'HMGET',
  KEYS[1],
  'userId',
  'terminal'
)

local userId = sessionValues[1]
local terminal = sessionValues[2]

if not userId or not terminal then
  return { 1, 'ALREADY_GONE' }
end

if not isValidUserId(userId) or not isValidTerminal(terminal) then
  return { 0, 'INVALID_SESSION_DATA' }
end

local slotKey = slotKeyPrefix .. userId .. ':' .. terminal
local slotDigest = redis.call('GET', slotKey)

if slotDigest == currentDigest then
  redis.call('DEL', slotKey)
end

redis.call('DEL', KEYS[1])

return { 1, 'LOGGED_OUT' }
`

export const REVOKE_USER_SESSIONS_SCRIPT = String.raw`
local sessionKeyPrefix = ARGV[1]
local revokedCount = 0

for index = 1, #KEYS DO
  local digest = redis.call('GET', KEYS[index])

  if digest
    and string.len(digest) == 64
    and string.match(digest, '[0-9a-f]+$') ~= nil then
    redis.call('DEL', sessionKeyPrefix .. digest)
    revokedCount = revokedCount + 1
  end

  redis.call('DEL', KEYS[index])
end

return { 1, tostring(revokedCount) }
`
