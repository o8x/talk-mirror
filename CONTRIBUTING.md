# Contributing to Talk-mirror

Thanks for your interest in contributing! Here is how to get started.

## Prerequisites

- [Go](https://go.dev/dl/) 1.25+
- [Node.js](https://nodejs.org/) 22+
- [pnpm](https://pnpm.io/) 10+

## Setup

```bash
git clone https://github.com/o8x/talk-mirror.git
cd talk-mirror
make deps        # installs frontend dependencies
```

## Building

The project embeds the frontend into a single Go binary:

```bash
make build       # builds the frontend and compiles ./talk-mirror
```

Run it:

```bash
./talk-mirror -d ./data
```

## Testing

```bash
make test        # go vet + go test ./...
```

The Go packages require the frontend to be built first (the binary embeds
`views/dist`), so run `cd views && pnpm build` if you have not built it yet.

## Workflow

1. Fork the repository.
2. Create a feature branch (`git checkout -b feat/my-change`).
3. Make your changes, following the existing code style (`gofmt` for Go).
4. Add tests where appropriate.
5. Commit with a concise message (English).
6. Open a pull request against `main`.

All pull requests must pass the CI checks (`test` job) before merging.

## Commit conventions

Use [conventional commits](https://www.conventionalcommits.org/) with English
messages, e.g.:

- `feat: add X`
- `fix: resolve Y`
- `docs: update README`
- `chore: bump dependencies`

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
