const { Store, wildcardToRegex } = require('../index.cjs.js');
const R = require('ramda');

describe('Store', () => {
  it('should check existence of methods and data', () => {
    const state = new Store({ test: '123' });
    expect(typeof state).toEqual('object');
    expect(typeof state.unsubscribe).toBe('function');
    expect(typeof state.subscribe).toBe('function');
    expect(typeof state.subscribeAll).toBe('function');
    expect(typeof state.update).toBe('function');
    expect(typeof state.get).toBe('function');
    expect(typeof state.destroy).toBe('function');
    state.destroy();
  });

  it('should call Store', () => {
    const state = new Store({ a: 'a', b: 'b', c: { d: 'd' } });
    let $d;
    state.subscribe('c.d', (d) => {
      $d = d;
    });
    expect($d).toEqual('d');
    state.destroy();
  });

  it('should update and watch', () => {
    const state = new Store({
      test: {
        test2: 123
      }
    });
    let test2 = 0;
    let event = 0;
    state.subscribe('test.test2', (value) => {
      test2 = value;
      if (event === 0) {
        expect(value).toEqual(123);
      } else {
        expect(value).toEqual(100);
      }
      event++;
    });
    expect(test2).toEqual(123);
    state.update('test.test2', (oldValue) => {
      return 100;
    });
    expect(test2).toEqual(100);
    state.destroy();
  });

  it('should watch all paths', () => {
    const state = new Store({ x: 10, y: 20, z: { xyz: 50 } });
    let result = {};
    const paths = [];
    state.subscribeAll(['x', 'y', 'z.xyz'], (value, path) => {
      result = R.set(R.lensPath(path.split('.')), value, result);
      paths.push(path);
    });
    expect(result).toEqual({ x: 10, y: 20, z: { xyz: 50 } });
    expect(paths).toEqual(['x', 'y', 'z.xyz']);
    state.destroy();
  });

  it('should accept value instead of function inside update', () => {
    const state = new Store({ x: 10, y: 20, z: { xyz: 50 } });
    expect(state.get()).toEqual({ x: 10, y: 20, z: { xyz: 50 } });
    state.update('z.xyz', 'string instead of fn');
    expect(state.get('z.xyz')).toEqual('string instead of fn');
    state.destroy();
  });

  it('should match simple wildcards (object)', () => {
    const state = new Store({
      one: {
        two: { three: { four: { five: 5 } } },
        '2': { three: { four: { five: 5, six: 6 } } }
      }
    });
    const paths = [];
    const values = [];
    state.subscribe('one.*.three', (value, path) => {
      paths.push(path); // 2
      values.push(value);
    });
    state.subscribe('one.*.*.four.*', (value, path) => {
      paths.push(path); // 3
      values.push(value);
    });
    expect(paths.length).toEqual(5);
    expect(values.length).toEqual(5);
    expect(values[0]).toEqual({ four: { five: 5, six: 6 } });
    expect(values[1]).toEqual({ four: { five: 5 } });

    expect(values[2]).toEqual(5);
    expect(values[3]).toEqual(6);
    expect(values[4]).toEqual(5);

    const fullPath = 'one.two.three.four.five';
    state.update(fullPath, 'mod');
    expect(paths.length).toEqual(6);
    expect(values.length).toEqual(6);
    expect(values[5]).toEqual('mod');
  });

  it('should match advanced wildcards (object)', () => {
    const state = new Store({
      one: {
        two: { three: { four: { five: 5 } } },
        '2': { three: { four: { five: 5, six: 6 } } }
      }
    });
    const paths = [];
    const values = [];
    state.subscribe('one.two.three.**', (value, path) => {
      paths.push(path); // 2
      values.push(value);
    });

    expect(paths.length).toEqual(2);
    expect(values.length).toEqual(2);
    expect(paths[0]).toEqual('one.two.three.four');
    expect(paths[1]).toEqual('one.two.three.four.five');
    expect(values[0]).toEqual({ five: 5 });
    expect(values[1]).toEqual(5);

    const fullPath = 'one.two.three.four.five';
    state.update(fullPath, 'mod');
    expect(paths.length).toEqual(3);
    expect(values.length).toEqual(3);
    expect(paths[2]).toEqual('one.two.three.four.five');
    expect(values[2]).toEqual('mod');
  });

  it('should match simple wildcards (array)', () => {
    const state = new Store({
      one: [{ two: 2 }, { two: 22 }, { two: 222 }, { three: 3 }, [{ test: 'x' }]]
    });
    const paths = [];
    const values = [];
    state.subscribe('one.*.two', (value, path) => {
      paths.push(path); // 3
      values.push(value);
    });
    state.subscribe('one.*.*.test', (value, path) => {
      paths.push(path); // 1
      values.push(value);
    });
    state.subscribe('one.*.three', (value, path) => {
      paths.push(path); // 1
      values.push(value);
    });
    expect(paths.length).toEqual(5);
    expect(values.length).toEqual(5);
    expect(values[0]).toEqual(2);
    expect(values[1]).toEqual(22);
    expect(values[2]).toEqual(222);

    expect(values[3]).toEqual('x');
    expect(values[4]).toEqual(3);

    const fullPath = 'one.0.two';
    state.update(fullPath, 'mod');
    expect(paths.length).toEqual(6);
    expect(values.length).toEqual(6);
    expect(values[5]).toEqual('mod');
  });

  it('should match advanced wildcards (array)', () => {
    const state = new Store({
      one: [{ two: 2 }, { two: 22 }, { two: 222 }, { three: 3 }, [{ test: 'x' }]]
    });
    const paths = [];
    const values = [];
    state.subscribe('one.**.two', (value, path) => {
      paths.push(path); // 3
      values.push(value);
    });
    state.subscribe('one.**.test', (value, path) => {
      paths.push(path); // 1
      values.push(value);
    });
    state.subscribe('**.three', (value, path) => {
      paths.push(path); // 1
      values.push(value);
    });

    expect(paths.length).toEqual(5);
    expect(values.length).toEqual(5);
    expect(values[0]).toEqual(2);
    expect(values[1]).toEqual(22);
    expect(values[2]).toEqual(222);

    expect(values[3]).toEqual('x');
    expect(values[4]).toEqual(3);

    const fullPath = 'one.0.two';
    state.update(fullPath, 'mod');
    expect(paths.length).toEqual(6);
    expect(values.length).toEqual(6);
    expect(values[5]).toEqual('mod');
  });

  it('should match advanced wildcards mixed (array)', () => {
    const state = new Store({
      one: [{ two: 2 }, { two: 22 }, { two: 222 }, { three: { four: 4 } }, [{ test: 'x' }]]
    });
    const paths = [];
    const values = [];
    state.subscribe('one.**.tw*', (value, path) => {
      paths.push(path); // 3
      values.push(value);
    });
    state.subscribe('one.**.t*st', (value, path) => {
      paths.push(path); // 1
      values.push(value);
    });
    state.subscribe('**.three.*', (value, path) => {
      paths.push(path); // 1
      values.push(value);
    });

    expect(paths.length).toEqual(5);
    expect(values.length).toEqual(5);
    expect(values[0]).toEqual(2);
    expect(values[1]).toEqual(22);
    expect(values[2]).toEqual(222);

    expect(values[3]).toEqual('x');
    expect(values[4]).toEqual(4);

    const fullPath = 'one.0.two';
    state.update(fullPath, 'mod');
    expect(paths.length).toEqual(6);
    expect(values.length).toEqual(6);
    expect(values[5]).toEqual('mod');
  });

  it('should watch recursively', () => {
    const state = new Store({ one: { two: { three: 3 }, 2: 2 } });
    const paths = [];
    const values = [];
    state.subscribe('one...', (value, path) => {
      paths.push(path);
      values.push(value);
    });
    expect(paths.length).toEqual(1);
    expect(values.length).toEqual(1);
    expect(paths[0]).toEqual('one');
    expect(values[0]).toEqual({ two: { three: 3 }, 2: 2 });

    state.update('one.two.three', 33);
    expect(paths.length).toEqual(2);
    expect(values.length).toEqual(2);
    expect(paths[1]).toEqual('one.two.three');
    expect(values[1]).toEqual({ two: { three: 33 }, 2: 2 });
  });

  it('should watch recursively within path (subscribe)', () => {
    const state = new Store({ one: { two: { three: { four: 4 } }, 2: 2 } });
    const paths = [];
    const values = [];
    state.subscribe('one.two.three...', (value, path) => {
      paths.push(path);
      values.push(value);
    });
    expect(paths.length).toEqual(1);
    expect(values.length).toEqual(1);
    expect(paths[0]).toEqual('one.two.three');
    expect(values[0]).toEqual({ four: 4 });

    state.update('one.two.three', { four: 44 });
    expect(paths.length).toEqual(2);
    expect(values.length).toEqual(2);
    expect(paths[1]).toEqual('one.two.three');
    expect(values[1]).toEqual({ four: 44 });
  });

  it('should watch recursively within path (subscribeAll)', () => {
    const state = new Store({ one: { two: { three: { four: [{ x: 1 }, { y: 2 }, { z: 3 }] } }, 2: 2 } });
    const paths = [];
    const values = [];
    state.subscribeAll(['one.two.three.four.0...'], (value, path) => {
      paths.push(path);
      values.push(value);
    });
    expect(paths.length).toEqual(1);
    expect(values.length).toEqual(1);
    expect(paths[0]).toEqual('one.two.three.four.0');
    expect(values[0]).toEqual({ x: 1 });

    state.update('one.two.three.four', [{ x: 2 }, { y: 2 }, { z: 3 }]);
    expect(paths.length).toEqual(2);
    expect(values.length).toEqual(2);
    expect(paths[1]).toEqual('one.two.three.four');
    expect(values[1]).toEqual({ x: 2 });
  });

  it('should watch recursively within path and return final value if it is not an object/array', () => {
    const state = new Store({ one: { two: { three: { four: [{ x: 1 }, { y: 2 }, { z: 3 }] } }, 2: 2 } });
    const paths = [];
    const values = [];
    state.subscribeAll(['one.two.three.four.0.x...'], (value, path) => {
      paths.push(path);
      values.push(value);
    });
    expect(paths.length).toEqual(1);
    expect(values.length).toEqual(1);
    expect(paths[0]).toEqual('one.two.three.four.0.x');
    expect(values[0]).toEqual(1);

    state.update('one.two.three.four', [{ x: 2 }, { y: 2 }, { z: 3 }]);
    expect(paths.length).toEqual(2);
    expect(values.length).toEqual(2);
    expect(paths[1]).toEqual('one.two.three.four');
    expect(values[1]).toEqual(2);
  });
});
