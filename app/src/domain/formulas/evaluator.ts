// Безопасный вычислитель арифметических выражений для формул методик.
// Поддержка: числа, имена переменных, + - * /, скобки, унарный минус. Без eval.

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'ident'; name: string }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

export class FormulaError extends Error {}

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++;
      const raw = expr.slice(i, j);
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new FormulaError(`Некорректное число: ${raw}`);
      tokens.push({ kind: 'num', value });
      i = j;
    } else if (/[A-Za-zА-Яа-я_]/.test(ch)) {
      let j = i;
      while (j < expr.length && /[A-Za-zА-Яа-я0-9_]/.test(expr[j])) j++;
      tokens.push({ kind: 'ident', name: expr.slice(i, j) });
      i = j;
    } else if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ kind: 'op', op: ch });
      i++;
    } else if (ch === '(') {
      tokens.push({ kind: 'lparen' });
      i++;
    } else if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      i++;
    } else {
      throw new FormulaError(`Недопустимый символ в формуле: «${ch}»`);
    }
  }
  return tokens;
}

// Рекурсивный спуск: expr := term (('+'|'-') term)*; term := factor (('*'|'/') factor)*;
// factor := num | ident | '(' expr ')' | '-' factor
export function evaluate(expr: string, vars: Record<string, number>): number {
  const tokens = tokenize(expr);
  let pos = 0;

  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr(): number {
    let left = parseTerm();
    while (peek()?.kind === 'op' && ((peek() as { op: string }).op === '+' || (peek() as { op: string }).op === '-')) {
      const op = (next() as { op: '+' | '-' }).op;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (peek()?.kind === 'op' && ((peek() as { op: string }).op === '*' || (peek() as { op: string }).op === '/')) {
      const op = (next() as { op: '*' | '/' }).op;
      const right = parseFactor();
      if (op === '/') {
        if (right === 0) throw new FormulaError('Деление на ноль');
        left = left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  }

  function parseFactor(): number {
    const token = peek();
    if (!token) throw new FormulaError('Неожиданный конец формулы');
    if (token.kind === 'num') {
      next();
      return token.value;
    }
    if (token.kind === 'ident') {
      next();
      const value = vars[token.name];
      if (value === undefined) throw new FormulaError(`Неизвестная переменная: ${token.name}`);
      return value;
    }
    if (token.kind === 'op' && token.op === '-') {
      next();
      return -parseFactor();
    }
    if (token.kind === 'lparen') {
      next();
      const value = parseExpr();
      if (peek()?.kind !== 'rparen') throw new FormulaError('Ожидалась закрывающая скобка');
      next();
      return value;
    }
    throw new FormulaError('Синтаксическая ошибка в формуле');
  }

  const result = parseExpr();
  if (pos !== tokens.length) throw new FormulaError('Лишние символы в конце формулы');
  return result;
}
