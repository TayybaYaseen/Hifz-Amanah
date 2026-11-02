// Very common passwords rejected by the password policy (FR-AUTH-012, DEC-B08).
// Only entries of 8+ characters matter, because shorter passwords already fail the length rule.
// Compared case-insensitively. Sources: widely published "most common password" lists, plus local variants.
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  '12345678', '123456789', '1234567890', '12345678910', '0123456789', '87654321', '987654321',
  '11111111', '111111111', '1111111111', '00000000', '000000000', '0000000000', '22222222',
  '55555555', '66666666', '77777777', '88888888', '99999999', '12121212', '11223344',
  '112233445566', '123123123', '1234512345', '123456123456', '147258369', '159753456',
  '1q2w3e4r', '1q2w3e4r5t', '1qaz2wsx', '1qazxsw2', 'zaq12wsx', 'q1w2e3r4', 'q1w2e3r4t5',
  'qwertyui', 'qwertyuiop', 'qwerty123', 'qwerty1234', 'qwerty12', 'asdfghjk', 'asdfghjkl',
  'zxcvbnm1', 'zxcvbnmm', 'abcd1234', 'abc12345', 'abc123456', 'abcdefgh', 'abcdefg1',
  'password', 'password1', 'password12', 'password123', 'password1234', 'passw0rd', 'p@ssw0rd',
  'p@ssword', 'pa55word', 'pass1234', 'passpass', 'mypassword', 'newpassword', 'password!',
  'iloveyou', 'iloveyou1', 'iloveyou2', 'loveyou1', 'sunshine', 'sunshine1', 'princess',
  'princess1', 'football', 'football1', 'baseball', 'basketball', 'superman', 'batman123',
  'starwars', 'whatever', 'trustno1', 'welcome1', 'welcome123', 'letmein1', 'letmein123',
  'login123', 'admin123', 'admin1234', 'administrator', 'master123', 'mustang1', 'michael1',
  'jennifer', 'jordan23', 'shadow123', 'monkey123', 'dragon123', 'computer', 'internet',
  'samsung1', 'samsung123', 'google123', 'facebook', 'liverpool', 'chelsea1', 'arsenal1',
  'cricket1', 'cricket123', 'pakistan', 'pakistan1', 'pakistan123', 'pakistan786', 'lahore123',
  'karachi123', 'islamabad', 'allah786', 'bismillah', 'bismillah1', 'bismillah786', 'muhammad',
  'muhammad1', 'mohammad1', 'madrasa123', 'madrassa123', 'quran123', 'hifz1234', 'student1',
  'student123', 'teacher1', 'teacher123', 'changeme', 'changeme1', 'default1', 'secret123',
  'test1234', 'testtest', 'test12345', 'guest123', 'user1234', 'freedom1', 'charlie1',
  'aaaaaaaa', 'aaaaaaaaa', 'asdf1234', 'asdfasdf', 'qazwsxedc', 'qweasdzxc', '1234qwer',
  '1234abcd', 'a1b2c3d4', 'a1234567', 'aa123456', 'aa12345678', 'abc123abc', 'zaq1zaq1',
  '786786786', '78678678', 'hello123', 'hellohello', 'goodluck', 'blessing', 'ilovemom',
]);
