import Document, { Head, Main, NextScript } from 'next/document'

export default class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx)

    return {
      ...initialProps
    }
  }

  render() {
    return (
      <html>
        <Head>
          <style>{`body { margin: 0 } /* custom! */`}</style>
        </Head>
        <body>
          <p>
            {(process.env.MODE === 'production') ? (
              <strong>This is the production backend server</strong>
            ) : (
              <strong>This is the development backend server</strong>
            )}
          </p>
          <Main />
          <NextScript />
        </body>
      </html>
    )
  }
}
