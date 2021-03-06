/* eslint-disable jest/no-mocks-import */
import type { Transformer } from '@jest/transform'
import { LogLevels, testing } from 'bs-logger'
import { join, resolve } from 'path'
import * as ts from 'typescript'

import * as _myModule from '..'
import { logTargetMock } from '../__helpers__/mocks'
import { createConfigSet, defaultResolve } from '../__helpers__/fakers'
import type { TsJestGlobalOptions } from '../types'
import * as _backports from '../util/backports'
import { getPackageVersion } from '../util/get-package-version'
import { normalizeSlashes } from '../util/normalize-slashes'
import { mocked } from '../util'

import { IGNORE_DIAGNOSTIC_CODES, MATCH_NOTHING, TS_JEST_OUT_DIR } from './config-set'
// eslint-disable-next-line no-duplicate-imports
import type { ConfigSet } from './config-set'
import { Deprecations } from '../util/messages'

jest.mock('../util/backports')
jest.mock('../index')
jest.mock('../util/get-package-version')

const backports = mocked(_backports)
const myModule = mocked(_myModule)

backports.backportJestConfig.mockImplementation((_, config) => ({
  ...config,
  __backported: true,
}))

const pkgVersion = (pkgName: string) => require(`${pkgName}/package.json`).version || '????'

beforeEach(() => {
  jest.clearAllMocks()
})

describe('isTestFile', () => {
  it.each([
    {
      jestConfig: {
        testRegex: [{}],
        testMatch: [],
      } as any,
    },
    {
      jestConfig: {
        testMatch: [],
        testRegex: [/.*\.(spec|test)\.[jt]sx?$/],
      } as any,
    },
    {
      jestConfig: {
        testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
        testRegex: [],
      } as any,
    },
    {
      jestConfig: {
        testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
        testRegex: ['**/?(*.)+(foo|bar).[tj]s?(x)'],
      } as any,
    },
  ])('should return a boolean value whether the file matches test pattern', (config) => {
    expect(createConfigSet(config).isTestFile('foo.spec.ts')).toMatchSnapshot()
  })
})

describe('tsJest', () => {
  const getConfigSet = (tsJest?: TsJestGlobalOptions) => createConfigSet({ tsJestConfig: tsJest })
  const getTsJest = (tsJest?: TsJestGlobalOptions) => getConfigSet(tsJest).tsJest

  describe('jest', () => {
    it('should return correct config and go thru backports', () => {
      expect(createConfigSet().tsJest).toMatchSnapshot()
      expect(backports.backportJestConfig).toHaveBeenCalledTimes(1)
    })

    it('should merge parent config if any with globals is an empty object', () => {
      expect(
        createConfigSet({
          jestConfig: {
            globals: {},
          } as any,
          parentConfig: { __parent: true } as any,
        }).tsJest,
      ).toMatchSnapshot()
    })

    it('should merge parent config if any with globals is undefined', () => {
      expect(
        createConfigSet({
          jestConfig: {
            globals: undefined,
          } as any,
          parentConfig: { __parent: true } as any,
        }).tsJest,
      ).toMatchSnapshot()
    })
  })

  describe('packageJson', () => {
    it('should be correct when packageJson is true', () => {
      const EXPECTED = {
        kind: 'file',
        value: undefined,
      }
      expect(getTsJest().packageJson).toEqual(EXPECTED)
      expect(getTsJest({ packageJson: true }).packageJson).toEqual(EXPECTED)
    })

    it('should be correct for given file as string', () => {
      const FILE = 'bar/tsconfig.foo.json'
      const EXPECTED = {
        kind: 'file',
        value: defaultResolve(FILE),
      }
      expect(getTsJest({ packageJson: FILE }).packageJson).toEqual(EXPECTED)
    })

    it('should be correct for given file as an object', () => {
      const packageJsonStub = require('../__mocks__/package-foo.json')
      const EXPECTED = {
        kind: 'inline',
        value: packageJsonStub,
      }
      expect(getTsJest({ packageJson: packageJsonStub }).packageJson).toEqual(EXPECTED)
    })

    it('should be correct for inline config', () => {
      const CONFIG = { foo: 'bar' }
      const EXPECTED = {
        kind: 'inline',
        value: CONFIG,
      }
      expect(getTsJest({ packageJson: CONFIG as any }).packageJson).toEqual(EXPECTED)
    })
  })

  describe('transformers', () => {
    const logger = testing.createLoggerMock()

    it('should display deprecation warning message when config transformers is string array', () => {
      const cs = createConfigSet({
        jestConfig: {
          rootDir: 'src',
          cwd: 'src',
          globals: {
            'ts-jest': {
              astTransformers: ['dummy-transformer'],
            },
          },
        } as any,
        logger,
        resolve: null,
      })
      logger.target.clear()

      expect(Object.keys(cs.tsJest.transformers)).toHaveLength(1)
      expect(logger.target.lines[1]).toMatchSnapshot()
    })

    it.each([
      {},
      {
        before: ['dummy-transformer'],
      },
      {
        after: ['dummy-transformer'],
      },
      {
        afterDeclarations: ['dummy-transformer'],
      },
    ])('should not display deprecation warning message when config transformers is an object', (data) => {
      const cs = createConfigSet({
        jestConfig: {
          rootDir: 'src',
          cwd: 'src',
          globals: {
            'ts-jest': {
              astTransformers: data,
            },
          },
        } as any,
        logger,
        resolve: null,
      })
      logger.target.clear()

      expect(Object.keys(cs.tsJest.transformers)).toHaveLength(Object.keys(data).length)
      expect(logger.target.lines[1]).not.toContain(Deprecations.AstTransformerArrayConfig)
    })
  }) // custom AST transformers

  describe('diagnostics', () => {
    it('should be correct for default value', () => {
      const EXPECTED = {
        ignoreCodes: IGNORE_DIAGNOSTIC_CODES,
        pretty: true,
        throws: true,
      }
      expect(getTsJest().diagnostics).toEqual(EXPECTED)
      expect(getTsJest({ diagnostics: true }).diagnostics).toEqual(EXPECTED)
    })

    it('should be correct for false', () => {
      const EXPECTED = {
        ignoreCodes: IGNORE_DIAGNOSTIC_CODES,
        pretty: true,
        pathRegex: MATCH_NOTHING.source,
        throws: false,
      }
      expect(getTsJest({ diagnostics: false }).diagnostics).toEqual(EXPECTED)
    })

    it('should be correct for inline config', () => {
      const EXPECTED = {
        ignoreCodes: [...IGNORE_DIAGNOSTIC_CODES, 10, 25],
        pretty: false,
        pathRegex: '\\.test\\.ts',
        throws: true,
      }
      expect(
        getTsJest({
          diagnostics: {
            ignoreCodes: '10, 25',
            pathRegex: EXPECTED.pathRegex,
            pretty: false,
          },
        }).diagnostics,
      ).toEqual(EXPECTED)
      expect(
        getTsJest({
          diagnostics: {
            ignoreCodes: ['10', 25],
            pretty: false,
            pathRegex: RegExp(EXPECTED.pathRegex),
          },
        }).diagnostics,
      ).toEqual(EXPECTED)
    })
    it('should have correct throws value', () => {
      const EXPECTED = {
        ignoreCodes: IGNORE_DIAGNOSTIC_CODES,
        pretty: true,
      }
      expect(getTsJest({ diagnostics: { warnOnly: true } }).diagnostics).toEqual({ ...EXPECTED, throws: false })
      expect(getTsJest({ diagnostics: { warnOnly: false } }).diagnostics).toEqual({ ...EXPECTED, throws: true })
    })
  }) // diagnostics

  describe('stringifyContentPathRegex', () => {
    it('should be correct for default value', () => {
      expect(getTsJest().stringifyContentPathRegex).toBeUndefined()
      expect(getTsJest({ stringifyContentPathRegex: null as any }).stringifyContentPathRegex).toBeUndefined()
    })
    it('should be normalized to a string', () => {
      expect(getTsJest({ stringifyContentPathRegex: /abc/ }).stringifyContentPathRegex).toBe('abc')
      expect(getTsJest({ stringifyContentPathRegex: 'abc' }).stringifyContentPathRegex).toBe('abc')
    })
  }) // stringifyContentPathRegex

  describe('isolatedModules', () => {
    it('should be correct for default value', () => {
      expect(getTsJest().isolatedModules).toBe(false)
      expect(getTsJest({ isolatedModules: false }).isolatedModules).toBe(false)
    })
    it('should be normalized to a boolean', () => {
      expect(getTsJest({ isolatedModules: 'yes' as any }).isolatedModules).toBe(true)
      expect(getTsJest({ isolatedModules: 1 as any }).isolatedModules).toBe(true)
    })
  }) // isolatedModules

  describe('compiler', () => {
    it('should be correct for default value', () => {
      expect(getTsJest().compiler).toBe('typescript')
      expect(getTsJest({ compiler: 'typescript' }).compiler).toBe('typescript')
    })
    it('should be given non-default value', () => {
      expect(getTsJest({ compiler: 'ttypescript' }).compiler).toBe('ttypescript')
    })
  }) // compiler
}) // tsJest

describe('parsedTsConfig', () => {
  const get = (tsJest?: TsJestGlobalOptions, parentConfig?: TsJestGlobalOptions) =>
    createConfigSet({ tsJestConfig: tsJest, parentConfig }).parsedTsConfig

  it('should read file list from default tsconfig', () => {
    // since the default is to lookup for tsconfig,
    // we should have this file in the list
    expect(get().fileNames).toContain(normalizeSlashes(__filename))
  })

  it.each(['tsConfig', 'tsconfig'])('should include compiler config from `%s` option key', (key: string) => {
    expect(get({ [key]: { baseUrl: 'src/config' } }).options.baseUrl).toBe(normalizeSlashes(__dirname))
  })

  it('should include compiler config from base config', () => {
    expect(get(void 0, { tsConfig: { target: 'esnext' as any } }).options.target).toBe(ts.ScriptTarget.ESNext)
  })

  it('should override some options', () => {
    expect(get({ tsConfig: { module: 'esnext' as any, inlineSources: false } }).options).toMatchObject({
      module: ts.ModuleKind.CommonJS,
      inlineSources: true,
    })
  })

  it('should include default outDir $$ts-jest$$ when allowJs is enabled and no outDir from config', () => {
    expect(get(void 0, { tsConfig: { allowJs: true } }).options.outDir).toBe(TS_JEST_OUT_DIR)
  })

  it('should be able to read extends', () => {
    const cs = createConfigSet({
      tsJestConfig: { tsConfig: 'tsconfig.build.json' },
      resolve: null,
    })
    expect(cs.parsedTsConfig.options).toMatchObject({
      module: ts.ModuleKind.CommonJS,
      rootDir: normalizeSlashes(resolve(__dirname, '..')),
      skipLibCheck: true,
    })
  })

  it('should warn about possibly wrong module config and set synth. default imports', () => {
    const target = logTargetMock()
    target.clear()
    const cs = createConfigSet({
      tsJestConfig: {
        tsConfig: { module: 'ES6', esModuleInterop: false } as any,
        diagnostics: { warnOnly: true, pretty: false },
      },
      resolve: null,
    })
    expect(cs.parsedTsConfig.options).toMatchObject({
      module: ts.ModuleKind.CommonJS,
      allowSyntheticDefaultImports: true,
      esModuleInterop: false,
    })
    expect(target.lines.warn.join()).toMatchInlineSnapshot(`
      "[level:40] message TS151001: If you have issues related to imports, you should consider setting \`esModuleInterop\` to \`true\` in your TypeScript configuration file (usually \`tsconfig.json\`). See https://blogs.msdn.microsoft.com/typescript/2018/01/31/announcing-typescript-2-7/#easier-ecmascript-module-interoperability for more information.
      "
    `)
  })

  it('should not warn neither set synth. default imports if using babel', () => {
    const target = logTargetMock()
    target.clear()
    const cs = createConfigSet({
      tsJestConfig: {
        tsConfig: { module: 'amd', esModuleInterop: false } as any,
        diagnostics: { warnOnly: true, pretty: false },
        babelConfig: { babelrc: false },
      },
      resolve: null,
    })
    expect(cs.parsedTsConfig.options).toMatchObject({
      module: ts.ModuleKind.AMD,
      esModuleInterop: false,
    })
    expect(cs.parsedTsConfig.options.allowSyntheticDefaultImports).toBeFalsy()
    expect(target.lines.warn).toHaveLength(0)
  })
}) // parsedTsConfig

describe('resolvePath', () => {
  it('should resolve paths', () => {
    const cs = createConfigSet({ jestConfig: { rootDir: '/root', cwd: '/cwd' } as any, resolve: null })
    const doResolve = (path: string) => cs.resolvePath(path, { throwIfMissing: false })
    expect(doResolve('bar.js')).toBe(resolve('/cwd/bar.js'))
    expect(doResolve('./bar.js')).toBe(resolve('/cwd/./bar.js'))
    expect(doResolve('<rootDir>bar.js')).toBe(resolve('/root/bar.js'))
    expect(doResolve('<rootDir>/bar.js')).toBe(resolve('/root//bar.js'))
  })
  it('should resolve node paths', () => {
    const cs = createConfigSet({ jestConfig: { rootDir: '/root', cwd: '/cwd' } as any, resolve: null })
    const doResolve = (path: string) => cs.resolvePath(path, { throwIfMissing: false, nodeResolve: true })
    expect(doResolve('json5')).toBe(resolve(__dirname, '../../node_modules/json5', require('json5/package.json').main))
    expect(doResolve('./bar.js')).toBe(resolve('/cwd/bar.js'))
    expect(doResolve('<rootDir>bar.js')).toBe(resolve('/root/bar.js'))
    expect(doResolve('<rootDir>/bar.js')).toBe(resolve('/root//bar.js'))
  })
  it('should throw for invalid paths', () => {
    const cs = createConfigSet({ jestConfig: { rootDir: __dirname, cwd: __dirname } as any, resolve: null })
    const doResolve = (path: string) => cs.resolvePath(path)
    expect(() => doResolve('bar.js')).toThrow()
    expect(() => doResolve('./bar.js')).toThrow()
    expect(() => doResolve('<rootDir>bar.js')).toThrow()
    expect(() => doResolve('<rootDir>/bar.js')).toThrow()
  })
}) // resolvePath

describe('readTsConfig', () => {
  let findConfig!: jest.SpyInstance<string | undefined>
  let readConfig!: jest.SpyInstance<{ config?: any; error?: ts.Diagnostic }>
  let parseConfig!: jest.SpyInstance<ts.ParsedCommandLine>
  let cs!: ConfigSet

  beforeAll(() => {
    findConfig = jest.spyOn(ts, 'findConfigFile')
    readConfig = jest.spyOn(ts, 'readConfigFile')
    parseConfig = jest.spyOn(ts, 'parseJsonConfigFileContent')
  })

  afterAll(() => {
    findConfig.mockRestore()
    readConfig.mockRestore()
    parseConfig.mockRestore()
  })

  describe('cannot resolve configFileName', () => {
    beforeEach(() => {
      cs = createConfigSet({ jestConfig: { rootDir: '/root', cwd: '/cwd' } as any })
      findConfig.mockReturnValue(undefined)
      readConfig.mockReturnValue({
        error: {
          code: 404,
        } as any,
      })
    })

    afterEach(() => {
      findConfig.mockClear()
      readConfig.mockClear()
      parseConfig.mockClear()
    })

    it('should use correct paths when searching', () => {
      const conf = cs.readTsConfig()
      expect(conf.options.configFilePath).toBeUndefined()
      expect(readConfig).not.toHaveBeenCalled()
      expect(parseConfig.mock.calls[0][2]).toBe('/root')
      expect(parseConfig.mock.calls[0][4]).toBeUndefined()
    })

    it('should use given tsconfig path', () => {
      const conf = cs.readTsConfig(undefined, '/foo/tsconfig.bar.json')
      expect(conf.options.configFilePath).toBeUndefined()
      expect(findConfig).not.toBeCalled()
      expect(readConfig.mock.calls[0][0]).toBe('/foo/tsconfig.bar.json')
      expect(parseConfig).not.toHaveBeenCalled()
    })
  })

  describe('resolve configFileName normally', () => {
    beforeEach(() => {
      cs = createConfigSet({ jestConfig: { rootDir: '/root', cwd: '/cwd' } as any })
      findConfig.mockImplementation((p: string) => `${p}/tsconfig.json`)
      readConfig.mockImplementation((p) => ({ config: { path: p, compilerOptions: {} } }))
    })

    afterEach(() => {
      findConfig.mockClear()
      readConfig.mockClear()
    })

    describe('module in tsConfig is not the same as forced module and esModuleInterop is not in tsConfig', () => {
      beforeEach(() => {
        parseConfig.mockImplementation((conf: any) => ({
          options: {
            ...conf,
            module: ts.ModuleKind.AMD,
          },
          fileNames: [],
          errors: [],
        }))
      })

      afterEach(() => {
        parseConfig.mockClear()
      })

      it('should use correct paths when searching', () => {
        const conf = cs.readTsConfig()
        expect(conf.options.path).toBe('/root/tsconfig.json')
        expect(findConfig.mock.calls[0][0]).toBe('/root')
        expect(readConfig.mock.calls[0][0]).toBe('/root/tsconfig.json')
        expect(parseConfig.mock.calls[0][2]).toBe('/root')
        expect(parseConfig.mock.calls[0][4]).toBe('/root/tsconfig.json')
        expect(conf.options.allowSyntheticDefaultImports).toEqual(true)
        expect(conf.errors).toMatchSnapshot()
      })

      it('should use given tsconfig path', () => {
        const conf = cs.readTsConfig(undefined, '/foo/tsconfig.bar.json')
        expect(conf.options.path).toBe('/foo/tsconfig.bar.json')
        expect(findConfig).not.toBeCalled()
        expect(readConfig.mock.calls[0][0]).toBe('/foo/tsconfig.bar.json')
        expect(parseConfig.mock.calls[0][2]).toBe('/foo')
        expect(parseConfig.mock.calls[0][4]).toBe('/foo/tsconfig.bar.json')
        expect(conf.errors).toMatchSnapshot()
      })
    })

    describe('module in tsConfig is not the same as forced module and allowSyntheticDefaultImports is false in tsConfig', () => {
      beforeEach(() => {
        parseConfig.mockImplementation((conf: any) => ({
          options: {
            ...conf,
            module: ts.ModuleKind.AMD,
            allowSyntheticDefaultImports: false,
          },
          fileNames: [],
          errors: [],
        }))
      })

      afterEach(() => {
        parseConfig.mockClear()
      })

      it('should use correct paths when searching', () => {
        const conf = cs.readTsConfig()
        expect(conf.options.path).toBe('/root/tsconfig.json')
        expect(findConfig.mock.calls[0][0]).toBe('/root')
        expect(readConfig.mock.calls[0][0]).toBe('/root/tsconfig.json')
        expect(parseConfig.mock.calls[0][2]).toBe('/root')
        expect(parseConfig.mock.calls[0][4]).toBe('/root/tsconfig.json')
        expect(conf.options.allowSyntheticDefaultImports).toEqual(true)
        expect(conf.errors).toMatchSnapshot()
      })

      it('should use given tsconfig path', () => {
        const conf = cs.readTsConfig(undefined, '/foo/tsconfig.bar.json')
        expect(conf.options.path).toBe('/foo/tsconfig.bar.json')
        expect(findConfig).not.toBeCalled()
        expect(readConfig.mock.calls[0][0]).toBe('/foo/tsconfig.bar.json')
        expect(parseConfig.mock.calls[0][2]).toBe('/foo')
        expect(parseConfig.mock.calls[0][4]).toBe('/foo/tsconfig.bar.json')
        expect(conf.errors).toMatchSnapshot()
      })
    })

    describe('module in tsConfig is the same as forced module and esModuleInterop true is in tsConfig', () => {
      beforeEach(() => {
        parseConfig.mockImplementation((conf: any) => ({
          options: {
            ...conf,
            module: ts.ModuleKind.ESNext,
            esModuleInterop: true,
          },
          fileNames: [],
          errors: [],
        }))
      })

      afterEach(() => {
        parseConfig.mockClear()
      })

      it('should use correct paths when searching', () => {
        const conf = cs.readTsConfig()
        expect(conf.options.path).toBe('/root/tsconfig.json')
        expect(findConfig.mock.calls[0][0]).toBe('/root')
        expect(readConfig.mock.calls[0][0]).toBe('/root/tsconfig.json')
        expect(parseConfig.mock.calls[0][2]).toBe('/root')
        expect(parseConfig.mock.calls[0][4]).toBe('/root/tsconfig.json')
        expect(conf.options.allowSyntheticDefaultImports).toBeUndefined()
        expect(conf.errors).toEqual([])
      })

      it('should use given tsconfig path', () => {
        const conf = cs.readTsConfig(undefined, '/foo/tsconfig.bar.json')
        expect(conf.options.path).toBe('/foo/tsconfig.bar.json')
        expect(findConfig).not.toBeCalled()
        expect(readConfig.mock.calls[0][0]).toBe('/foo/tsconfig.bar.json')
        expect(parseConfig.mock.calls[0][2]).toBe('/foo')
        expect(parseConfig.mock.calls[0][4]).toBe('/foo/tsconfig.bar.json')
        expect(conf.errors).toEqual([])
      })
    })

    describe('module in tsConfig is the same as forced module and allowSyntheticDefaultImports true is in tsConfig', () => {
      beforeEach(() => {
        parseConfig.mockImplementation((conf: any) => ({
          options: {
            ...conf,
            module: ts.ModuleKind.ESNext,
            allowSyntheticDefaultImports: true,
          },
          fileNames: [],
          errors: [],
        }))
      })

      afterEach(() => {
        parseConfig.mockClear()
      })

      it('should use correct paths when searching', () => {
        const conf = cs.readTsConfig()
        expect(conf.options.path).toBe('/root/tsconfig.json')
        expect(findConfig.mock.calls[0][0]).toBe('/root')
        expect(readConfig.mock.calls[0][0]).toBe('/root/tsconfig.json')
        expect(parseConfig.mock.calls[0][2]).toBe('/root')
        expect(parseConfig.mock.calls[0][4]).toBe('/root/tsconfig.json')
        expect(conf.errors).toEqual([])
        expect(conf.options.allowSyntheticDefaultImports).toEqual(true)
      })

      it('should use given tsconfig path', () => {
        const conf = cs.readTsConfig(undefined, '/foo/tsconfig.bar.json')
        expect(conf.options.path).toBe('/foo/tsconfig.bar.json')
        expect(findConfig).not.toBeCalled()
        expect(readConfig.mock.calls[0][0]).toBe('/foo/tsconfig.bar.json')
        expect(parseConfig.mock.calls[0][2]).toBe('/foo')
        expect(parseConfig.mock.calls[0][4]).toBe('/foo/tsconfig.bar.json')
        expect(conf.errors).toEqual([])
        expect(conf.options.allowSyntheticDefaultImports).toEqual(true)
      })
    })
  })

  describe('mismatch nodejs version and typescript target', () => {
    const logTarget = logTargetMock()
    function mismatchTestCaseContent(rawTarget: string | undefined, scriptTarget: ts.ScriptTarget) {
      parseConfig.mockImplementation((conf: any) => ({
        options: {
          ...conf,
          target: scriptTarget,
        },
        fileNames: [],
        errors: [],
      }))
      readConfig.mockImplementation((p) => ({ config: { path: p, compilerOptions: { target: rawTarget } } }))

      cs.readTsConfig()
    }

    describe.each([
      { jestConfig: { rootDir: '/root', cwd: '/cwd' } as any, tsJestConfig: { babelConfig: true } },
      { jestConfig: { rootDir: '/root', cwd: '/cwd' } as any },
    ])('toggle warning message for users who are using ts-jest with babel or without babel', (config) => {
      const shouldAction = config.tsJestConfig?.babelConfig ? `shouldn't` : 'should'

      beforeEach(() => {
        logTarget.clear()
        cs = createConfigSet(config)
        findConfig.mockImplementation((p: string) => `${p}/tsconfig.json`)
      })

      afterEach(() => {
        findConfig.mockClear()
        parseConfig.mockClear()
        readConfig.mockClear()
      })

      /**
       * It seems like not possible to mock process.version so the condition here is needed
       */
      if (process.version.startsWith('v10')) {
        it(
          `${shouldAction} show warning message when nodejs version is 10 and typescript target is higher than es2018` +
            ` with tsconfig contains target`,
          () => {
            mismatchTestCaseContent('es2019', ts.ScriptTarget.ES2019)
            // eslint-disable-next-line
            config.tsJestConfig?.babelConfig
              ? expect(logTarget.filteredLines(LogLevels.warn, Infinity)[0]).toBeUndefined()
              : // expect.toEqual gives weird result here so toContain is workaround for it.
                expect(logTarget.filteredLines(LogLevels.warn, Infinity)[0]).toContain(
                  '[level:40] There is a mismatch between your ' +
                    `NodeJs version ${process.version} and your TypeScript target es2019. This might lead to some unexpected errors ` +
                    'when running tests with `ts-jest`. To fix this, you can check https://github.com/microsoft/TypeScript/wiki/Node-Target-Mapping',
                )
          },
        )

        it(
          `${shouldAction} show warning message when nodejs version is 10 and typescript target is higher than es2018` +
            ` with tsconfig doesn't contain target`,
          () => {
            mismatchTestCaseContent(undefined, ts.ScriptTarget.ES2019)
            // eslint-disable-next-line
            config.tsJestConfig?.babelConfig
              ? expect(logTarget.filteredLines(LogLevels.warn, Infinity)[0]).toBeUndefined()
              : // expect.toEqual gives weird result here so toContain is workaround for it.
                expect(logTarget.filteredLines(LogLevels.warn, Infinity)[0]).toContain(
                  '[level:40] There is a mismatch between your ' +
                    `NodeJs version ${process.version} and your TypeScript target es2019. This might lead to some unexpected errors ` +
                    'when running tests with `ts-jest`. To fix this, you can check https://github.com/microsoft/TypeScript/wiki/Node-Target-Mapping',
                )
          },
        )
      } else {
        it(
          `${shouldAction} show warning message when nodejs version is 12 and typescript target is higher than es2019` +
            ` with tsconfig contains target`,
          () => {
            mismatchTestCaseContent('es2020', ts.ScriptTarget.ES2020)
            // eslint-disable-next-line
            config.tsJestConfig?.babelConfig
              ? expect(logTarget.filteredLines(LogLevels.warn, Infinity)[0]).toBeUndefined()
              : // expect.toEqual gives weird result here so toContain is workaround for it.
                expect(logTarget.filteredLines(LogLevels.warn, Infinity)[0]).toContain(
                  '[level:40] There is a mismatch between your ' +
                    `NodeJs version ${process.version} and your TypeScript target es2020. This might lead to some unexpected errors ` +
                    'when running tests with `ts-jest`. To fix this, you can check https://github.com/microsoft/TypeScript/wiki/Node-Target-Mapping',
                )
          },
        )

        it(
          `${shouldAction} show warning message when nodejs version is 12 and typescript target is higher than es2019` +
            ` with tsconfig doesn't target`,
          () => {
            mismatchTestCaseContent(undefined, ts.ScriptTarget.ES2020)
            // eslint-disable-next-line
            config.tsJestConfig?.babelConfig
              ? expect(logTarget.filteredLines(LogLevels.warn, Infinity)[0]).toBeUndefined()
              : // expect.toEqual gives weird result here so toContain is workaround for it.
                expect(logTarget.filteredLines(LogLevels.warn, Infinity)[0]).toContain(
                  '[level:40] There is a mismatch between your ' +
                    `NodeJs version ${process.version} and your TypeScript target es2020. This might lead to some unexpected errors ` +
                    'when running tests with `ts-jest`. To fix this, you can check https://github.com/microsoft/TypeScript/wiki/Node-Target-Mapping',
                )
          },
        )
      }
    })
  })
}) // readTsConfig

describe('versions', () => {
  describe('package version cannot be resolved', () => {
    let mock: jest.MockInstance<string | undefined, [string]>

    beforeEach(() => {
      mock = mocked(getPackageVersion).mockReturnValue(undefined)
    })

    afterEach(() => {
      mock.mockRestore()
    })

    it('should return correct version map without babel', () => {
      expect(createConfigSet().versions).toEqual({
        jest: '-',
        'ts-jest': myModule.version,
        typescript: '-',
      })
    })

    it('should return correct version map with babel', () => {
      expect(createConfigSet({ tsJestConfig: { babelConfig: {} } }).versions).toEqual({
        '@babel/core': '-',
        'babel-jest': '-',
        jest: '-',
        'ts-jest': myModule.version,
        typescript: '-',
      })
    })
  })

  describe('package version can be resolved', () => {
    let mock: jest.MockInstance<string | undefined, [string]>

    beforeEach(() => {
      mock = mocked(getPackageVersion).mockImplementation(pkgVersion)
    })

    afterEach(() => {
      mock.mockRestore()
    })

    it('should return correct version map without babel', () => {
      expect(createConfigSet().versions).toEqual({
        jest: pkgVersion('jest'),
        'ts-jest': myModule.version,
        typescript: pkgVersion('typescript'),
      })
    })

    it('should return correct version map with babel', () => {
      expect(createConfigSet({ tsJestConfig: { babelConfig: {} } }).versions).toEqual({
        '@babel/core': pkgVersion('@babel/core'),
        'babel-jest': pkgVersion('babel-jest'),
        jest: pkgVersion('jest'),
        'ts-jest': myModule.version,
        typescript: pkgVersion('typescript'),
      })
    })
  })
}) // versions

describe('tsJestDigest', () => {
  it('should be the package digest', () => {
    expect(createConfigSet().tsJestDigest).toBe(myModule.digest)
  })
}) // tsJestDigest

describe('shouldStringifyContent', () => {
  it('should return correct value is defined', () => {
    const cs = createConfigSet({ tsJestConfig: { tsConfig: false, stringifyContentPathRegex: '\\.str$' } as any })
    expect(cs.shouldStringifyContent('/foo/bar.ts')).toBe(false)
    expect(cs.shouldStringifyContent('/foo/bar.str')).toBe(true)
  })

  it('should return correct value when stringifyContentPathRegex is undefined', () => {
    const cs = createConfigSet({ tsJestConfig: { tsConfig: false } as any })
    expect(cs.shouldStringifyContent('/foo/bar.ts')).toBe(false)
  })
}) // shouldStringifyContent

describe('tsCacheDir', () => {
  const cacheName = 'configSetTmp'
  const cacheDir = join(process.cwd(), cacheName)
  const partialTsJestCacheDir = join(cacheDir, 'ts-jest')

  it.each([undefined, Object.create(null)])(
    'should return value from which is the combination of ts jest config and jest config when running test with cache',
    (data) => {
      expect(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        createConfigSet({
          jestConfig: {
            cache: true,
            cacheDirectory: cacheDir,
            globals: data,
          },
          resolve: null,
        }).tsCacheDir!.indexOf(partialTsJestCacheDir),
      ).toEqual(0)
    },
  )

  it('should return undefined when running test without cache', () => {
    expect(createConfigSet({ resolve: null }).tsCacheDir).toBeUndefined()
  })

  it('return value with the real version of dependencies in package.json when running test with cache', () => {
    const pkg = {
      optionalDependencies: { opt: '1.2.3' },
      peerDependencies: { peer: '1.2.4' },
      devDependencies: { dev: '1.2.5' },
      dependencies: { std: '1.2.6' },
    }
    const realVersions: any = {
      peer: '0.1.0',
      dev: '4.3.2',
      std: '9.10.2',
      opt: '2.0.2',
    }
    const mock: jest.MockInstance<string | undefined, [string]> = mocked(getPackageVersion).mockImplementation(
      (moduleName: string) => realVersions[moduleName],
    )
    const cs = createConfigSet({
      jestConfig: {
        cache: true,
        cacheDirectory: cacheDir,
        globals: {
          'ts-jest': { tsConfig: false },
        },
      },
      projectPackageJson: pkg,
    })

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(cs.tsCacheDir!.indexOf(partialTsJestCacheDir)).toEqual(0)

    mock.mockRestore()
  })
})

describe('shouldReportDiagnostic', () => {
  it('should return correct value', () => {
    let cs = createConfigSet({ tsJestConfig: { tsConfig: false, diagnostics: { pathRegex: '/foo/' } } as any })
    expect(cs.shouldReportDiagnostic('/foo/index.ts')).toBe(true)
    expect(cs.shouldReportDiagnostic('/bar/index.ts')).toBe(false)
    cs = createConfigSet({ tsJestConfig: { tsConfig: false } as any })
    expect(cs.shouldReportDiagnostic('/foo/index.ts')).toBe(true)
    expect(cs.shouldReportDiagnostic('/bar/index.ts')).toBe(true)
  })
}) // shouldReportDiagnostic

describe('tsCompiler', () => {
  it('should be a compiler object', () => {
    const cs = createConfigSet({
      jestConfig: {
        testRegex: [],
        testMatch: [],
      },
      tsJestConfig: { tsConfig: false } as any,
    })
    const compiler = cs.tsCompiler
    expect(compiler.cwd).toBe(cs.cwd)
    expect(typeof compiler.compile).toBe('function')
  })
}) // tsCompiler

describe('tsCustomTransformers', () => {
  it.each([
    {},
    {
      before: ['dummy-transformer'],
    },
    {
      after: ['dummy-transformer'],
    },
    {
      afterDeclarations: ['dummy-transformer'],
    },
  ])('should return an object containing all resolved transformers', (data) => {
    const cs = createConfigSet({
      jestConfig: {
        rootDir: 'src',
        cwd: 'src',
        globals: {
          'ts-jest': {
            astTransformers: data,
          },
        },
      } as any,
      resolve: null,
    })

    expect(cs.tsCustomTransformers).toMatchSnapshot()
  })
})

describe('hooks', () => {
  it('should return empty object when environment variable TS_JEST_HOOKS is undefined', () => {
    expect(createConfigSet().hooks).toEqual({})
  })

  it('should return value when environment variable TS_JEST_HOOKS is defined', () => {
    process.env.TS_JEST_HOOKS = './foo'
    expect(createConfigSet().hooks).toBeDefined()
  })
}) // hooks

describe('babelJestTransformer', () => {
  const logger = testing.createLoggerMock()

  it('should return babelJestTransformer without babelConfig option', () => {
    const cs = createConfigSet({
      jestConfig: { rootDir: 'src', cwd: 'src' },
      logger,
      resolve: null,
    })
    logger.target.clear()
    const babelJest = cs.babelJestTransformer as Transformer

    expect(cs.tsJest.babelConfig).toBeUndefined()
    expect(logger.target.lines[2]).toMatchInlineSnapshot(`
        "[level:20] babel is disabled
        "
      `)
    expect(babelJest).toBeUndefined()
  })

  it('should return babelJestTransformer with babalConfig is true', () => {
    const cs = createConfigSet({
      jestConfig: {
        rootDir: 'src',
        cwd: 'src',
        globals: {
          'ts-jest': {
            babelConfig: true,
          },
        },
      },
      logger,
      resolve: null,
    })
    logger.target.clear()
    const babelJest = cs.babelJestTransformer as Transformer

    expect(cs.tsJest.babelConfig?.kind).toEqual('file')
    expect(cs.tsJest.babelConfig?.value).toBeUndefined()
    expect(logger.target.lines[2]).toMatchInlineSnapshot(`
        "[level:20] normalized babel config via ts-jest option
        "
      `)
    expect(babelJest.canInstrument).toBe(true)
    expect(babelJest.createTransformer).toBeUndefined()
    expect(typeof babelJest.getCacheKey).toBe('function')
    expect(typeof babelJest.process).toBe('function')
  })

  it('should return babelJestTransformer with non javascript file path', () => {
    const FILE = 'src/__mocks__/.babelrc-foo'
    const cs = createConfigSet({
      jestConfig: {
        globals: {
          'ts-jest': {
            babelConfig: FILE,
          },
        },
      },
      logger,
      resolve: null,
    })
    logger.target.clear()
    const babelJest = cs.babelJestTransformer as Transformer

    expect(cs.tsJest.babelConfig?.kind).toEqual('file')
    expect(cs.tsJest.babelConfig?.value).toEqual(join(process.cwd(), FILE))
    expect(logger.target.lines[3]).toMatchInlineSnapshot(`
        "[level:20] normalized babel config via ts-jest option
        "
      `)
    expect(babelJest.canInstrument).toBe(true)
    expect(babelJest.createTransformer).toBeUndefined()
    expect(typeof babelJest.getCacheKey).toBe('function')
    expect(typeof babelJest.process).toBe('function')
  })

  it('should return babelJestTransformer with javascript file path', () => {
    const FILE = 'src/__mocks__/babel-foo.config.js'
    const cs = createConfigSet({
      jestConfig: {
        globals: {
          'ts-jest': {
            babelConfig: FILE,
          },
        },
      },
      logger,
      resolve: null,
    })
    logger.target.clear()
    const babelJest = cs.babelJestTransformer as Transformer

    expect(cs.tsJest.babelConfig?.kind).toEqual('file')
    expect(cs.tsJest.babelConfig?.value).toEqual(join(process.cwd(), FILE))
    expect(logger.target.lines[3]).toMatchInlineSnapshot(`
        "[level:20] normalized babel config via ts-jest option
        "
      `)
    expect(babelJest.canInstrument).toBe(true)
    expect(babelJest.createTransformer).toBeUndefined()
    expect(typeof babelJest.getCacheKey).toBe('function')
    expect(typeof babelJest.process).toBe('function')
  })

  it('should return babelJestTransformer with loaded config object', () => {
    const babelConfig = require('../__mocks__/babel-foo.config')
    const cs = createConfigSet({
      jestConfig: {
        globals: {
          'ts-jest': {
            babelConfig,
          },
        },
      },
      logger,
      resolve: null,
    })
    logger.target.clear()
    const babelJest = cs.babelJestTransformer as Transformer

    expect(cs.tsJest.babelConfig?.kind).toEqual('inline')
    expect(cs.tsJest.babelConfig?.value).toMatchInlineSnapshot(`
      Object {
        "presets": Array [
          "@babel/preset-env",
          "@babel/preset-typescript",
          "@babel/preset-react",
        ],
      }
    `)
    expect(logger.target.lines[2]).toMatchInlineSnapshot(`
        "[level:20] normalized babel config via ts-jest option
        "
      `)
    expect(babelJest.canInstrument).toBe(true)
    expect(babelJest.createTransformer).toBeUndefined()
    expect(typeof babelJest.getCacheKey).toBe('function')
    expect(typeof babelJest.process).toBe('function')
  })

  it('should return babelJestTransformer with inline config', () => {
    const CONFIG = { comments: true }
    const cs = createConfigSet({
      jestConfig: {
        globals: {
          'ts-jest': {
            babelConfig: CONFIG,
          },
        },
      },
      resolve: null,
      logger,
    })
    logger.target.clear()
    const babelJest = cs.babelJestTransformer as Transformer

    expect(cs.tsJest.babelConfig?.kind).toEqual('inline')
    expect(cs.tsJest.babelConfig?.value).toEqual(CONFIG)
    expect(logger.target.lines[2]).toMatchInlineSnapshot(`
        "[level:20] normalized babel config via ts-jest option
        "
      `)
    expect(babelJest.canInstrument).toBe(true)
    expect(babelJest.createTransformer).toBeUndefined()
    expect(typeof babelJest.getCacheKey).toBe('function')
    expect(typeof babelJest.process).toBe('function')
  })
}) // babelJestTransformer

describe('cacheKey', () => {
  it('should be a string', () => {
    const cs = createConfigSet({
      tsJestConfig: { tsConfig: require.resolve('../__mocks__/tsconfig-src.json') },
      projectDependencies: {
        opt: '1.2.3',
        peer: '1.2.4',
        dev: '1.2.5',
        std: '1.2.6',
      },
      resolve: null,
    })
    // we tested those and don't want the snapshot to change all the time we upgrade
    const val = cs.jsonValue.value
    delete val.versions
    // we don't need to verify configFilePath and tsConfig value here
    val.tsconfig.options.configFilePath = ''
    val.tsJest.tsConfig.value = ''
    cs.jsonValue.value = val
    /**
     * digest is mocked in src/__mocks__/index.ts
     * we don't want to save snapshot with real paths of tsconfig so we replace real path with empty string
     */
    expect(cs.cacheKey).toMatchSnapshot()
  })
}) // cacheKey

describe('jsonValue', () => {
  it('should create jsonValue based on each config and version', () => {
    const cs = createConfigSet({
      tsJestConfig: { tsConfig: require.resolve('../__mocks__/tsconfig-src.json') },
      projectDependencies: {
        'some-module': '1.2.3',
      },
      resolve: null,
    })
    const val = cs.jsonValue.valueOf()
    expect(cs.toJSON()).toEqual(val)
    // we don't need to verify configFilePath and tsConfig value here
    val.tsconfig.options.configFilePath = ''
    val.tsJest.tsConfig.value = ''

    // digest is mocked in src/__mocks__/index.ts
    expect(val).toMatchSnapshot()
  })
}) // jsonValue

describe('raiseDiagnostics', () => {
  const createTsError = jest.fn(
    // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
    (list: ts.Diagnostic[]) => new Error(list.map((d) => `[TS${d.code}] ${d.messageText}`).join('\n')),
  )
  const logger = testing.createLoggerMock()
  describe('with warnOnly config', () => {
    const filterDiagnostics = jest.fn((list) => list)
    const makeDiagnostic = ({
      messageText = 'foo',
      code = 9999,
      category = ts.DiagnosticCategory.Warning,
    }: Partial<ts.Diagnostic> = {}): ts.Diagnostic => ({ messageText, code, category } as any)

    it('should throw when warnOnly is false', () => {
      const { raiseDiagnostics } = createConfigSet({ createTsError, filterDiagnostics })
      expect(() => raiseDiagnostics([])).not.toThrow()
      expect(() => raiseDiagnostics([makeDiagnostic()])).toThrowErrorMatchingInlineSnapshot('"[TS9999] foo"')
      expect(() => raiseDiagnostics([makeDiagnostic({ category: ts.DiagnosticCategory.Message })])).not.toThrow()
    })

    it('should not throw when warnOnly is true', () => {
      const { raiseDiagnostics } = createConfigSet({
        createTsError,
        filterDiagnostics,
        logger,
        tsJestConfig: { diagnostics: { warnOnly: true } },
      })
      logger.target.clear()
      expect(() => raiseDiagnostics([])).not.toThrow()
      expect(() => raiseDiagnostics([makeDiagnostic()])).not.toThrow()
      expect(logger.target.lines).toMatchInlineSnapshot(`
              Array [
                "[level:40] [TS9999] foo
              ",
              ]
          `)
    })
  })

  describe("diagnostics don't contain source file", () => {
    const makeDiagnostic = ({
      messageText = 'foo',
      code = 9999,
      category = ts.DiagnosticCategory.Warning,
    }: Partial<ts.Diagnostic> = {}): ts.Diagnostic => ({ messageText, code, category } as any)
    it('should throw when diagnostics contains file path and pathRegex config matches file path', () => {
      const { raiseDiagnostics } = createConfigSet({
        createTsError,
        logger,
        tsJestConfig: { diagnostics: { pathRegex: 'src/__mocks__/index.ts' } },
      })
      logger.target.clear()
      expect(() => raiseDiagnostics([makeDiagnostic()], 'src/__mocks__/index.ts')).toThrowErrorMatchingInlineSnapshot(
        '"[TS9999] foo"',
      )
      expect(logger.target.lines).toMatchInlineSnapshot('Array []')
    })

    it("should not throw when diagnostics contains file path and pathRegex config doesn't match file path", () => {
      const { raiseDiagnostics } = createConfigSet({
        createTsError,
        logger,
        tsJestConfig: { diagnostics: { warnOnly: true, pathRegex: '/bar/' } },
      })
      logger.target.clear()
      expect(() => raiseDiagnostics([makeDiagnostic()], 'src/__mocks__/index.ts')).not.toThrow()
      expect(logger.target.lines).toMatchInlineSnapshot('Array []')
    })
  })

  describe('diagnostics contain source file', () => {
    const program: ts.Program = ts.createProgram({
      options: {
        module: ts.ModuleKind.CommonJS,
      },
      rootNames: ['src/__mocks__/index.ts'],
    })
    const makeDiagnostic = ({
      messageText = 'foo',
      code = 9999,
      category = ts.DiagnosticCategory.Warning,
      file = program.getSourceFiles().find((sourceFile) => sourceFile.fileName === 'src/__mocks__/index.ts'),
    }: Partial<ts.Diagnostic> = {}): ts.Diagnostic => ({ messageText, code, category, file } as any)
    it("should not throw when pathRegex config doesn't match source file path", () => {
      const { raiseDiagnostics } = createConfigSet({
        createTsError,
        logger,
        tsJestConfig: { diagnostics: { pathRegex: '/foo/' } },
      })
      logger.target.clear()
      expect(() => raiseDiagnostics([makeDiagnostic()])).not.toThrow()
      expect(logger.target.lines).toMatchInlineSnapshot('Array []')
    })

    it("should throw when pathRegex config doesn't match source file path", () => {
      const { raiseDiagnostics } = createConfigSet({
        createTsError,
        logger,
        tsJestConfig: { diagnostics: { pathRegex: 'src/__mocks__/index.ts' } },
      })
      logger.target.clear()
      expect(() => raiseDiagnostics([makeDiagnostic()])).toThrowErrorMatchingInlineSnapshot('"[TS9999] foo"')
      expect(logger.target.lines).toMatchInlineSnapshot('Array []')
    })
  })
}) // raiseDiagnostics
