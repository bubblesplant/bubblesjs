export const CREATE_OR_REPLACE_SESSION_SCRIPT = String.raw`
local function isValidTerinal(value)
  return value == 'web' or value == 'desktop' or value == 'mobile'
end

local function isValidUserId(value)
  return string.len(value) > 0
    and string.len(value) <= 100
    and string.match(value, '^[%w_-]+$') ~= nil
end
`
