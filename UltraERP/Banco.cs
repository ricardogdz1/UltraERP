using System.Data.SqlClient;

namespace UltraERP
{
    public class Banco
    {
        private static string connectionString =
            "Server=DESKTOP-AU0R3CB\\SQLEXPRESS;Database=UltraERP;Integrated Security=True;";

        public static SqlConnection ObterConexao()
        {
            return new SqlConnection(connectionString);
        }
    }
}